import { execFileSync } from "node:child_process";

const usage = `
Usage:
  node scripts/chaos/retargetFisTemplates.mjs --template <id> [--template <id> ...]

Options:
  --template         FIS template id (repeatable). Or set SERVFIX_FIS_TEMPLATES (comma-separated)
  --stack            CloudFormation stack name (default: SERVFIX_FIS_STACK or ServfixStaging)
  --region           AWS region (default: SERVFIX_AWS_REGION or AWS_REGION or us-east-1)
  --cluster          ECS cluster ARN (optional, auto-resolved from stack output ClusterArn)
  --service          ECS service ARN (optional, auto-resolved from stack output ServiceArn)
  --alarm-arn        CloudWatch alarm ARN for stop condition (optional; defaults from FisAbort5xxAlarmArn output)
  --selection-mode   FIS target selection mode for ECS task target (default: ALL)
  --dry-run          Print intended updates without applying
  --help             Show help
`.trim();

const parseArgs = (argv) => {
  const args = {
    templates: [],
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help") {
      args.help = true;
      continue;
    }

    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (!token.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = token.split("=", 2);
    const key = rawKey.slice(2);
    const next = argv[index + 1];
    const value =
      inlineValue !== undefined ? inlineValue : next && !next.startsWith("--") ? next : undefined;

    if (value === undefined) {
      continue;
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    if (key === "template") {
      args.templates.push(value);
      continue;
    }

    args[key] = value;
  }

  return args;
};

const runAws = (args) => {
  try {
    return execFileSync("aws", args, { encoding: "utf8" }).trim();
  } catch (error) {
    const stderr = error?.stderr?.toString?.() || "";
    const stdout = error?.stdout?.toString?.() || "";
    const detail = stderr || stdout || String(error);
    throw new Error(`aws ${args.join(" ")}\n${detail}`);
  }
};

const getStackOutputs = (stackName, region) => {
  const raw = runAws([
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    stackName,
    "--region",
    region,
    "--output",
    "json",
  ]);
  const parsed = JSON.parse(raw);
  const outputs = parsed?.Stacks?.[0]?.Outputs ?? [];
  return Object.fromEntries(outputs.map((entry) => [entry.OutputKey, entry.OutputValue]));
};

const getRunningTaskArn = ({ clusterArn, serviceArn, region }) => {
  const taskArn = runAws([
    "ecs",
    "list-tasks",
    "--region",
    region,
    "--cluster",
    clusterArn,
    "--service-name",
    serviceArn,
    "--desired-status",
    "RUNNING",
    "--query",
    "taskArns[0]",
    "--output",
    "text",
  ]);

  if (!taskArn || taskArn === "None") {
    throw new Error(`No running tasks found for service ${serviceArn}`);
  }

  return taskArn;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }

  const envTemplates = (process.env.SERVFIX_FIS_TEMPLATES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const templates = [...envTemplates, ...args.templates].filter(Boolean);
  if (templates.length === 0) {
    throw new Error(`${usage}\n\nAt least one --template is required.`);
  }

  const region = args.region || process.env.SERVFIX_AWS_REGION || process.env.AWS_REGION || "us-east-1";
  const stackName = args.stack || process.env.SERVFIX_FIS_STACK || "ServfixStaging";
  const selectionMode =
    args["selection-mode"] || process.env.SERVFIX_FIS_SELECTION_MODE || "ALL";

  const stackOutputs = getStackOutputs(stackName, region);

  const clusterArn = args.cluster || process.env.SERVFIX_FIS_CLUSTER_ARN || stackOutputs.ClusterArn;
  const serviceArn = args.service || process.env.SERVFIX_FIS_SERVICE_ARN || stackOutputs.ServiceArn;
  const alarmArn =
    args["alarm-arn"] ||
    process.env.SERVFIX_FIS_STOP_ALARM_ARN ||
    stackOutputs.FisAbort5xxAlarmArn;

  if (!clusterArn || !serviceArn) {
    throw new Error(
      `Missing cluster/service ARN. Provide --cluster and --service, or expose ClusterArn and ServiceArn outputs in stack ${stackName}.`,
    );
  }

  const taskArn = getRunningTaskArn({ clusterArn, serviceArn, region });
  console.log(`Using task target: ${taskArn}`);

  for (const templateId of templates) {
    const rawTemplate = runAws([
      "fis",
      "get-experiment-template",
      "--region",
      region,
      "--id",
      templateId,
      "--output",
      "json",
    ]);
    const template = JSON.parse(rawTemplate).experimentTemplate;
    const targets = structuredClone(template.targets || {});
    let updatedEcsTargets = 0;

    for (const target of Object.values(targets)) {
      if (target.resourceType !== "aws:ecs:task") {
        continue;
      }

      target.resourceArns = [taskArn];
      delete target.resourceTags;
      delete target.filters;
      target.selectionMode = selectionMode;
      updatedEcsTargets += 1;
    }

    if (updatedEcsTargets === 0) {
      console.log(`Skipped ${templateId}: no aws:ecs:task targets found.`);
      continue;
    }

    const stopConditions = alarmArn
      ? [{ source: "aws:cloudwatch:alarm", value: alarmArn }]
      : template.stopConditions;

    if (args.dryRun) {
      console.log(
        `Dry run: ${templateId} -> ecsTargets=${updatedEcsTargets}, stopCondition=${JSON.stringify(stopConditions)}`,
      );
      continue;
    }

    runAws([
      "fis",
      "update-experiment-template",
      "--region",
      region,
      "--id",
      templateId,
      "--description",
      template.description,
      "--role-arn",
      template.roleArn,
      "--targets",
      JSON.stringify(targets),
      "--actions",
      JSON.stringify(template.actions),
      "--stop-conditions",
      JSON.stringify(stopConditions),
      "--query",
      "experimentTemplate.id",
      "--output",
      "text",
    ]);

    console.log(
      `Updated ${templateId}: ecsTargets=${updatedEcsTargets}, stopCondition=${
        alarmArn ? `cloudwatch-alarm:${alarmArn}` : "unchanged"
      }`,
    );
  }
};

main();
