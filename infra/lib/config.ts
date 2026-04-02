export type EnvironmentConfig = {
  name: "prod" | "staging";
  stackName: string;
  domainName: string;
  subdomain: string;
  enableFaultInjection: boolean;
  hostedZoneId: string;
  vpcCidr: string;
  taskCpu: number;
  taskMemoryMiB: number;
  desiredCount: number;
  minCapacity: number;
  maxCapacity: number;
  dbInstanceType: string;
  dbAllocatedStorage: number;
  dbMaxAllocatedStorage: number;
  dbName: string;
  backupRetentionDays: number;
  retainData: boolean;
  enableDeletionProtection: boolean;
  logRetentionDays: number;
  allowedCorsOrigins?: string[];
  s3BucketName?: string;
  ssmSecrets?: Record<string, string>;
};

const resolveFlutterwaveSecrets = (envName: "prod" | "staging") => {
  const prefix = envName.toUpperCase();
  return {
    FLUTTERWAVE_SECRET_KEY:
      process.env[`SERVFIX_${prefix}_FLUTTERWAVE_SECRET_KEY_PARAM`] ?? "",
    FLUTTERWAVE_WEBHOOK_HASH:
      process.env[`SERVFIX_${prefix}_FLUTTERWAVE_WEBHOOK_HASH_PARAM`] ?? "",
  };
};

export const environments = {
  prod: {
    name: "prod",
    stackName: "ServfixProd",
    domainName: "servfixgh.com",
    subdomain: "www",
    enableFaultInjection: false,
    hostedZoneId: "Z0771344MQYC6EHVNUOI",
    vpcCidr: "10.20.0.0/16",
    taskCpu: 256,
    taskMemoryMiB: 512,
    desiredCount: 1,
    minCapacity: 1,
    maxCapacity: 2,
    dbInstanceType: "t3.micro",
    dbAllocatedStorage: 20,
    dbMaxAllocatedStorage: 100,
    dbName: "servfix",
    backupRetentionDays: 7,
    retainData: true,
    enableDeletionProtection: true,
    logRetentionDays: 30,
    allowedCorsOrigins: ["https://www.servfixgh.com", "https://servfixgh.com"],
    ssmSecrets: resolveFlutterwaveSecrets("prod"),
  } satisfies EnvironmentConfig,
  staging: {
    name: "staging",
    stackName: "ServfixStaging",
    domainName: "servfixgh.com",
    subdomain: "staging",
    enableFaultInjection: false,
    hostedZoneId: "Z0771344MQYC6EHVNUOI",
    vpcCidr: "10.30.0.0/16",
    taskCpu: 256,
    taskMemoryMiB: 512,
    desiredCount: 1,
    minCapacity: 1,
    maxCapacity: 2,
    dbInstanceType: "t3.micro",
    dbAllocatedStorage: 20,
    dbMaxAllocatedStorage: 50,
    dbName: "servfix_staging",
    backupRetentionDays: 1,
    retainData: false,
    enableDeletionProtection: false,
    logRetentionDays: 7,
    allowedCorsOrigins: ["https://staging.servfixgh.com"],
    ssmSecrets: resolveFlutterwaveSecrets("staging"),
  } satisfies EnvironmentConfig,
} as const;

export const resolveCorsOrigins = (config: EnvironmentConfig) => {
  if (config.allowedCorsOrigins && config.allowedCorsOrigins.length > 0) {
    return config.allowedCorsOrigins;
  }

  const host = config.subdomain ? `${config.subdomain}.${config.domainName}` : config.domainName;
  return [`https://${host}`];
};
