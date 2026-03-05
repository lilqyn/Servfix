# AWS FIS on Servfix ECS (Staging First)

This project now supports ECS task chaos experiments in staging by default.

## What is already wired in CDK

- Fargate task definition has:
  - `pidMode: task` when FIS is enabled
  - Linux runtime platform
  - CloudFormation override for `EnableFaultInjection`
- ECS Exec is explicitly disabled on the service.
- SSM sidecar is added when FIS is enabled.
- IAM roles are created:
  - FIS experiment role (`FisExperimentRoleArn` output)
  - SSM managed-instance role (`FisManagedInstanceRoleArn` output)

## Enable/disable behavior

- Staging config: enabled by default (`infra/lib/config.ts`).
- Prod config: disabled by default.
- Optional env override at deploy time:
  - `SERVFIX_ENABLE_FIS=1` to force on for both stacks
  - `SERVFIX_PROD_ENABLE_FIS=1` to force on for prod only
  - `SERVFIX_STAGING_ENABLE_FIS=1` to force on for staging only

## Deploy staging

```powershell
npm --prefix infra run deploy -- ServfixStaging
```

## Get the required ARNs

```powershell
aws cloudformation describe-stacks `
  --stack-name ServfixStaging `
  --query "Stacks[0].Outputs[?OutputKey=='FisExperimentRoleArn' || OutputKey=='FisAbort5xxAlarmArn' || OutputKey=='ClusterArn' || OutputKey=='ServiceArn' || OutputKey=='LoadBalancerDns' || OutputKey=='AppUrl'].[OutputKey,OutputValue]" `
  --output table
```

## Pick one running task as target

```powershell
$cluster = "<staging-cluster-name>"
$service = "<staging-service-name>"

aws ecs list-tasks `
  --cluster $cluster `
  --service-name $service `
  --desired-status RUNNING `
  --query "taskArns[:1]" `
  --output json
```

## Create a CPU stress template (example)

```powershell
$roleArn = "<FisExperimentRoleArn>"
$taskArn = "<task-arn>"
$alarmArn = "<FisAbort5xxAlarmArn>"

aws fis create-experiment-template `
  --description "servfix-staging cpu stress 2m" `
  --role-arn $roleArn `
  --stop-conditions "[{\"source\":\"aws:cloudwatch:alarm\",\"value\":\"$alarmArn\"}]" `
  --targets "{\"taskTarget\":{\"resourceType\":\"aws:ecs:task\",\"resourceArns\":[\"$taskArn\"],\"selectionMode\":\"ALL\"}}" `
  --actions '{"cpuStress":{"actionId":"aws:ecs:task-cpu-stress","parameters":{"duration":"PT2M","percent":"70","workers":"1"},"targets":{"Tasks":"taskTarget"}}}'
```

## Create a network latency template (example)

```powershell
$roleArn = "<FisExperimentRoleArn>"
$taskArn = "<task-arn>"
$alarmArn = "<FisAbort5xxAlarmArn>"

aws fis create-experiment-template `
  --description "servfix-staging network latency 3m" `
  --role-arn $roleArn `
  --stop-conditions "[{\"source\":\"aws:cloudwatch:alarm\",\"value\":\"$alarmArn\"}]" `
  --targets "{\"taskTarget\":{\"resourceType\":\"aws:ecs:task\",\"resourceArns\":[\"$taskArn\"],\"selectionMode\":\"ALL\"}}" `
  --actions '{"latency":{"actionId":"aws:ecs:task-network-latency","parameters":{"duration":"PT3M","delayMilliseconds":"300","jitterMilliseconds":"40","sources":"ALL","flowsPercent":"100","useEcsFaultInjectionEndpoints":"true"},"targets":{"Tasks":"taskTarget"}}}'
```

## Keep templates valid after task rotation

Every deployment creates new task ARNs. Before running experiments, retarget templates:

```powershell
node scripts/chaos/retargetFisTemplates.mjs `
  --stack ServfixStaging `
  --template EXT2ZEVBv9VT6rjr `
  --template EXT6zJK4Az3pyuvek `
  --template EXT5cuFe9gkAcRYXA
```

Equivalent via npm script with env vars:

```powershell
$env:SERVFIX_FIS_TEMPLATES="EXT2ZEVBv9VT6rjr,EXT6zJK4Az3pyuvek,EXT5cuFe9gkAcRYXA"
npm run chaos:fis:retarget
```

## Safe rollout rules

- Run in staging first.
- Start with one task and short durations.
- Use CloudWatch alarm stop conditions on every template.
- Do not run packet-loss and latency experiments in parallel on the same task.
