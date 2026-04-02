import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import { EnvironmentConfig, resolveCorsOrigins } from "./config.js";

export interface ServfixStackProps extends StackProps {
  config: EnvironmentConfig;
}

export class ServfixStack extends Stack {
  constructor(scope: Construct, id: string, props: ServfixStackProps) {
    super(scope, id, props);

    const config = props.config;
    const modulePath = fileURLToPath(import.meta.url);
    const moduleDir = path.dirname(modulePath);
    const prismaSchemaPath = path.resolve(moduleDir, "../..", "prisma", "schema.prisma");
    const prismaSchemaHash = createHash("sha256")
      .update(readFileSync(prismaSchemaPath))
      .digest("hex");

    if (config.hostedZoneId === "REPLACE_ME") {
      throw new Error(
        `hostedZoneId is not set for ${config.stackName}. Update infra/lib/config.ts.`,
      );
    }

    const appDomain =
      config.subdomain && config.subdomain.length > 0
        ? `${config.subdomain}.${config.domainName}`
        : config.domainName;
    const appUrl = `https://${appDomain}`;
    const googleMapsApiKey =
      process.env[`SERVFIX_${config.name.toUpperCase()}_GOOGLE_MAPS_API_KEY`] ??
      process.env.SERVFIX_GOOGLE_MAPS_API_KEY ??
      "";
    const googleClientId =
      process.env[`SERVFIX_${config.name.toUpperCase()}_GOOGLE_CLIENT_ID`] ??
      process.env.SERVFIX_GOOGLE_CLIENT_ID ??
      "";
    const sentryDsn = (
      process.env[`SERVFIX_${config.name.toUpperCase()}_SENTRY_DSN`] ??
      process.env.SERVFIX_SENTRY_DSN ??
      ""
    ).trim();
    const opsAlertWebhookUrl = (
      process.env[`SERVFIX_${config.name.toUpperCase()}_OPS_ALERT_WEBHOOK_URL`] ??
      process.env.SERVFIX_OPS_ALERT_WEBHOOK_URL ??
      ""
    ).trim();
    const enableFaultInjection =
      config.enableFaultInjection ||
      process.env[`SERVFIX_${config.name.toUpperCase()}_ENABLE_FIS`] === "1" ||
      process.env.SERVFIX_ENABLE_FIS === "1";

    if (config.name === "prod") {
      if (!sentryDsn) {
        console.warn("WARNING: SERVFIX_PROD_SENTRY_DSN not set — Sentry will be disabled for prod.");
      }
      if (!opsAlertWebhookUrl) {
        console.warn("WARNING: SERVFIX_PROD_OPS_ALERT_WEBHOOK_URL not set — ops alerts will be disabled for prod.");
      }
    }

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
      hostedZoneId: config.hostedZoneId,
      zoneName: config.domainName,
    });

    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: appDomain,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      ipAddresses: ec2.IpAddresses.cidr(config.vpcCidr),
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "db",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // No NAT gateway — ECS tasks run in public subnets

    const bucket = new s3.Bucket(this, "UploadsBucket", {
      bucketName: config.s3BucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: !config.retainData,
      removalPolicy: config.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      intelligentTieringConfigurations: [
        {
          name: "MoveToInfrequentAccess",
          archiveAccessTierTime: Duration.days(90),
          deepArchiveAccessTierTime: Duration.days(180),
        },
      ],
      cors: [
        {
          allowedHeaders: ["*"],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: resolveCorsOrigins(config),
          exposedHeaders: ["ETag"],
        },
      ],
    });

    const db = new rds.DatabaseInstance(this, "Database", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_8,
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      instanceType: new ec2.InstanceType(config.dbInstanceType),
      credentials: rds.Credentials.fromGeneratedSecret("servfix"),
      databaseName: config.dbName,
      allocatedStorage: config.dbAllocatedStorage,
      maxAllocatedStorage: config.dbMaxAllocatedStorage,
      backupRetention: Duration.days(config.backupRetentionDays),
      deletionProtection: config.enableDeletionProtection,
      multiAz: false,
      publiclyAccessible: false,
      removalPolicy: config.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const dbUser = db.secret!.secretValueFromJson("username").toString();
    const dbPassword = db.secret!.secretValueFromJson("password").toString();
    const dbHost = db.instanceEndpoint.hostname;
    const dbPort = db.instanceEndpoint.port.toString();
    const dbUrl = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${config.dbName}?schema=public`;

    const dbUrlParam = new ssm.StringParameter(this, "DatabaseUrlParam", {
      parameterName: `/${config.stackName}/DATABASE_URL`,
      stringValue: dbUrl,
      tier: ssm.ParameterTier.STANDARD,
    });

    const jwtSecret = new secretsmanager.Secret(this, "JwtSecret", {
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
      removalPolicy: config.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const cluster = new ecs.Cluster(this, "Cluster", { vpc });

    const imageAsset = new DockerImageAsset(this, "AppImage", {
      directory: path.resolve(moduleDir, "../.."),
      file: "Dockerfile",
      buildArgs: {
        VITE_API_BASE: appUrl,
        VITE_GOOGLE_CLIENT_ID: googleClientId,
        VITE_GOOGLE_MAPS_API_KEY: googleMapsApiKey,
        PRISMA_SCHEMA_HASH: prismaSchemaHash,
      },
    });

    const logRetention =
      config.logRetentionDays === 7
        ? logs.RetentionDays.ONE_WEEK
        : logs.RetentionDays.ONE_MONTH;

    const logGroup = new logs.LogGroup(this, "AppLogs", {
      retention: logRetention,
      removalPolicy: config.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDef", {
      cpu: config.taskCpu,
      memoryLimitMiB: config.taskMemoryMiB,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      pidMode: enableFaultInjection ? ecs.PidMode.TASK : undefined,
    });
    const cfnTaskDefinition = taskDefinition.node.defaultChild as ecs.CfnTaskDefinition;
    cfnTaskDefinition.addPropertyOverride("EnableFaultInjection", enableFaultInjection);

    let fisManagedInstanceRole: iam.Role | undefined;
    let fisExperimentRole: iam.Role | undefined;

    if (enableFaultInjection) {
      fisManagedInstanceRole = new iam.Role(this, "FisManagedInstanceRole", {
        assumedBy: new iam.ServicePrincipal("ssm.amazonaws.com"),
        description: `Managed instance role for ECS task chaos experiments (${config.name})`,
      });
      fisManagedInstanceRole.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
      );
      fisManagedInstanceRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ["ssm:DeleteActivation", "ssm:DeregisterManagedInstance"],
          resources: ["*"],
        }),
      );

      taskDefinition.taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ["ssm:CreateActivation", "ssm:AddTagsToResource"],
          resources: ["*"],
        }),
      );
      taskDefinition.taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ["iam:PassRole"],
          resources: [fisManagedInstanceRole.roleArn],
          conditions: {
            StringEquals: {
              "iam:PassedToService": "ssm.amazonaws.com",
            },
          },
        }),
      );

      fisExperimentRole = new iam.Role(this, "FisExperimentRole", {
        assumedBy: new iam.ServicePrincipal("fis.amazonaws.com"),
        description: `Role used by AWS FIS for ECS task experiments (${config.name})`,
      });
      fisExperimentRole.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSFaultInjectionSimulatorECSAccess",
        ),
      );
    }

    const containerEnv: Record<string, string> = {
      NODE_ENV: "production",
      PORT: "4000",
      AWS_REGION: Stack.of(this).region,
      AWS_S3_BUCKET: bucket.bucketName,
      CORS_ORIGIN: resolveCorsOrigins(config).join(","),
      APP_URL: appUrl,
      PLATFORM_FEE_BPS: "1000",
      TAX_BPS: "0",
    };

    if (googleClientId) {
      containerEnv.GOOGLE_CLIENT_ID = googleClientId;
    }

    if (sentryDsn) {
      containerEnv.SENTRY_DSN = sentryDsn;
    }

    if (opsAlertWebhookUrl) {
      containerEnv.OPS_ALERT_WEBHOOK_URL = opsAlertWebhookUrl;
    }

    const meteredTurnApiKey =
      process.env[`SERVFIX_${config.name.toUpperCase()}_METERED_TURN_API_KEY`] ??
      process.env.SERVFIX_METERED_TURN_API_KEY ??
      "";
    if (meteredTurnApiKey) {
      containerEnv.METERED_TURN_API_KEY = meteredTurnApiKey;
    }

    const container = taskDefinition.addContainer("AppContainer", {
      image: ecs.ContainerImage.fromDockerImageAsset(imageAsset),
      logging: ecs.LogDriver.awsLogs({
        logGroup,
        streamPrefix: config.name,
      }),
      environment: containerEnv,
      secrets: {
        DATABASE_URL: ecs.Secret.fromSsmParameter(
          ssm.StringParameter.fromStringParameterName(
            this,
            "DbUrlParamRef",
            dbUrlParam.parameterName,
          ),
        ),
        JWT_SECRET: ecs.Secret.fromSecretsManager(jwtSecret),
      },
    });

    if (enableFaultInjection && fisManagedInstanceRole) {
      const ssmAgentActivationScript = [
        "set -e",
        "dnf upgrade -y",
        "dnf install jq procps awscli -y",
        "term_handler() {",
        "  echo \"Deleting SSM activation $ACTIVATION_ID\"",
        "  if ! aws ssm delete-activation --activation-id $ACTIVATION_ID --region $ECS_TASK_REGION; then",
        "    echo \"SSM activation $ACTIVATION_ID failed to be deleted\" 1>&2",
        "  fi",
        "  MANAGED_INSTANCE_ID=$(jq -e -r .ManagedInstanceID /var/lib/amazon/ssm/registration)",
        "  if ! aws ssm deregister-managed-instance --instance-id $MANAGED_INSTANCE_ID --region $ECS_TASK_REGION; then",
        "    echo \"SSM managed instance $MANAGED_INSTANCE_ID failed to be deregistered\" 1>&2",
        "  fi",
        "  kill -SIGTERM \"$child\" 2>/dev/null",
        "}",
        "trap term_handler SIGTERM SIGINT",
        "if [[ -n $ECS_CONTAINER_METADATA_URI_V4 ]] ; then",
        "  echo \"Found ECS Container Metadata, running activation with metadata\"",
        "  TASK_METADATA=$(curl \"${ECS_CONTAINER_METADATA_URI_V4}/task\")",
        "  ECS_TASK_ARN=$(echo $TASK_METADATA | jq -e -r .TaskARN)",
        "  ECS_TASK_ID=$(echo $ECS_TASK_ARN | awk -F/ '{print $NF}')",
        "  ECS_TASK_AVAILABILITY_ZONE=$(echo $TASK_METADATA | jq -r .AvailabilityZone)",
        "  ECS_TASK_REGION=$(echo $ECS_TASK_AVAILABILITY_ZONE | sed 's/.$//')",
        "  ECS_TASK_AVAILABILITY_ZONE_REGEX='^(af|ap|ca|cn|eu|me|sa|us|us-gov)-(central|north|(north(east|west))|south|south(east|west)|east|west)-[0-9]{1}[a-z]{1}$'",
        "  if [[ ! $ECS_TASK_AVAILABILITY_ZONE =~ $ECS_TASK_AVAILABILITY_ZONE_REGEX ]]; then",
        "    echo \"Availability zone $ECS_TASK_AVAILABILITY_ZONE is invalid. Expected format is us-east-1a.\"",
        "    exit 1",
        "  fi",
        "else",
        "  echo \"ECS Container Metadata is not found, running activation without metadata\"",
        "  ECS_TASK_AVAILABILITY_ZONE=$(curl -s 169.254.169.254/latest/meta-data/placement/availability-zone)",
        "  ECS_TASK_REGION=$(echo $ECS_TASK_AVAILABILITY_ZONE | sed 's/.$//')",
        "fi",
        "if [[ -z $ECS_TASK_ARN ]] ; then",
        "  echo \"Task ARN is required for FIS target resolution; unable to continue\"",
        "  exit 1",
        "fi",
        "if [[ -z $MANAGED_INSTANCE_ROLE_NAME ]] ; then",
        "  echo \"Environment variable MANAGED_INSTANCE_ROLE_NAME not set, can not continue\"",
        "  exit 1",
        "fi",
        "ACTIVATION=$(aws ssm create-activation --default-instance-name mi-$ECS_TASK_ID --iam-role $MANAGED_INSTANCE_ROLE_NAME --registration-limit 1 --tags Key=ECS_TASK_AVAILABILITY_ZONE,Value=$ECS_TASK_AVAILABILITY_ZONE Key=ECS_TASK_ARN,Value=$ECS_TASK_ARN Key=FAULT_INJECTION_SIDECAR,Value=true --region $ECS_TASK_REGION)",
        "ACTIVATION_ID=$(echo $ACTIVATION | jq -e -r .ActivationId)",
        "ACTIVATION_CODE=$(echo $ACTIVATION | jq -e -r .ActivationCode)",
        "echo \"Registering the instance with AWS SSM\"",
        "if ! amazon-ssm-agent -register -code \"$ACTIVATION_CODE\" -id \"$ACTIVATION_ID\" -region \"$ECS_TASK_REGION\"; then",
        "  echo \"Failed to register managed instance with AWS SSM\"",
        "  exit 1",
        "fi",
        "echo \"Registration complete, starting SSM agent...\"",
        "amazon-ssm-agent &",
        "child=$!",
        "wait \"$child\"",
      ].join("\n");

      taskDefinition.addContainer("FisSsmAgentSidecar", {
        image: ecs.ContainerImage.fromRegistry("public.ecr.aws/amazon-ssm-agent/amazon-ssm-agent:latest"),
        command: ["/bin/bash", "-c", ssmAgentActivationScript],
        essential: false,
        cpu: 64,
        memoryReservationMiB: 128,
        environment: {
          MANAGED_INSTANCE_ROLE_NAME: fisManagedInstanceRole.roleName,
        },
        logging: ecs.LogDriver.awsLogs({
          logGroup,
          streamPrefix: `${config.name}-fis-ssm`,
        }),
      });
    }

    for (const [envName, parameterName] of Object.entries(config.ssmSecrets ?? {})) {
      if (!parameterName) {
        continue;
      }
      const param = ssm.StringParameter.fromSecureStringParameterAttributes(
        this,
        `SecretParam${envName}`,
        { parameterName },
      );
      container.addSecret(envName, ecs.Secret.fromSsmParameter(param));
    }

    container.addPortMappings({ containerPort: 4000 });

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      "Service",
      {
        cluster,
        taskDefinition,
        desiredCount: config.desiredCount,
        enableExecuteCommand: false,
        publicLoadBalancer: true,
        assignPublicIp: true,
        taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
        listenerPort: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificate,
        redirectHTTP: true,
        healthCheckGracePeriod: Duration.seconds(180),
      },
    );

    service.targetGroup.configureHealthCheck({
      path: "/api/health",
      healthyHttpCodes: "200",
    });

    let fisAbort5xxAlarm: cloudwatch.Alarm | undefined;
    if (enableFaultInjection) {
      fisAbort5xxAlarm = new cloudwatch.Alarm(this, "FisAbort5xxAlarm", {
        metric: service.targetGroup.metricHttpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
          period: Duration.minutes(1),
          statistic: "sum",
        }),
        threshold: 10,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription:
          "Abort FIS experiments when target 5xx count spikes in a 1-minute window.",
      });
    }

    service.loadBalancer.setAttribute("idle_timeout.timeout_seconds", "3600");

    bucket.grantReadWrite(taskDefinition.taskRole);
    db.connections.allowDefaultPortFrom(service.service, "Allow ECS access");

    new route53.ARecord(this, "AliasRecord", {
      zone,
      recordName: config.subdomain || undefined,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(service.loadBalancer),
      ),
    });

    new CfnOutput(this, "AppUrl", { value: appUrl });
    new CfnOutput(this, "ClusterArn", { value: cluster.clusterArn });
    new CfnOutput(this, "ServiceArn", { value: service.service.serviceArn });
    new CfnOutput(this, "LoadBalancerDns", {
      value: service.loadBalancer.loadBalancerDnsName,
    });
    new CfnOutput(this, "DatabaseEndpoint", { value: dbHost });
    new CfnOutput(this, "UploadsBucketName", { value: bucket.bucketName });
    new CfnOutput(this, "DatabaseUrlParamName", {
      value: dbUrlParam.parameterName,
    });
    new CfnOutput(this, "JwtSecretArn", { value: jwtSecret.secretArn });
    if (fisExperimentRole) {
      new CfnOutput(this, "FisExperimentRoleArn", {
        value: fisExperimentRole.roleArn,
      });
    }
    if (fisManagedInstanceRole) {
      new CfnOutput(this, "FisManagedInstanceRoleArn", {
        value: fisManagedInstanceRole.roleArn,
      });
    }
    if (fisAbort5xxAlarm) {
      new CfnOutput(this, "FisAbort5xxAlarmArn", {
        value: fisAbort5xxAlarm.alarmArn,
      });
    }

  }
}




