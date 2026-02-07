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

    const bucket = new s3.Bucket(this, "UploadsBucket", {
      bucketName: config.s3BucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: !config.retainData,
      removalPolicy: config.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
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

    const dbUrlSecret = new secretsmanager.Secret(this, "DatabaseUrlSecret", {
      secretStringValue: SecretValue.unsafePlainText(dbUrl),
      removalPolicy: config.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
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
        PRISMA_SCHEMA_HASH: prismaSchemaHash,
      },
    });

    const logGroup = new logs.LogGroup(this, "AppLogs", {
      retention: logs.RetentionDays.THIRTY_DAYS,
      removalPolicy: config.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDef", {
      cpu: config.taskCpu,
      memoryLimitMiB: config.taskMemoryMiB,
    });

    const container = taskDefinition.addContainer("AppContainer", {
      image: ecs.ContainerImage.fromDockerImageAsset(imageAsset),
      logging: ecs.LogDriver.awsLogs({
        logGroup,
        streamPrefix: config.name,
      }),
      environment: {
        NODE_ENV: "production",
        PORT: "4000",
        AWS_REGION: Stack.of(this).region,
        AWS_S3_BUCKET: bucket.bucketName,
        CORS_ORIGIN: resolveCorsOrigins(config).join(","),
        APP_URL: appUrl,
        PLATFORM_FEE_BPS: "1000",
        TAX_BPS: "0",
      },
      secrets: {
        DATABASE_URL: ecs.Secret.fromSecretsManager(dbUrlSecret),
        JWT_SECRET: ecs.Secret.fromSecretsManager(jwtSecret),
      },
    });

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
        publicLoadBalancer: true,
        assignPublicIp: true,
        listenerPort: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificate,
        redirectHTTP: true,
        healthCheckGracePeriod: Duration.seconds(60),
      },
    );

    service.targetGroup.configureHealthCheck({
      path: "/api/health",
      healthyHttpCodes: "200",
    });

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
    new CfnOutput(this, "LoadBalancerDns", {
      value: service.loadBalancer.loadBalancerDnsName,
    });
    new CfnOutput(this, "DatabaseEndpoint", { value: dbHost });
    new CfnOutput(this, "UploadsBucketName", { value: bucket.bucketName });
    new CfnOutput(this, "DatabaseUrlSecretArn", {
      value: dbUrlSecret.secretArn,
    });
    new CfnOutput(this, "JwtSecretArn", { value: jwtSecret.secretArn });
  }
}




