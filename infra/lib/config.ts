export type EnvironmentConfig = {
  name: "prod" | "staging";
  stackName: string;
  domainName: string;
  subdomain: string;
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
  allowedCorsOrigins?: string[];
  s3BucketName?: string;
  ssmSecrets?: Record<string, string>;
};

export const environments = {
  prod: {
    name: "prod",
    stackName: "ServfixProd",
    domainName: "servfixgh.com",
    subdomain: "www",
    hostedZoneId: "Z0771344MQYC6EHVNUOI",
    vpcCidr: "10.20.0.0/16",
    taskCpu: 512,
    taskMemoryMiB: 1024,
    desiredCount: 2,
    minCapacity: 2,
    maxCapacity: 6,
    dbInstanceType: "t3.small",
    dbAllocatedStorage: 20,
    dbMaxAllocatedStorage: 100,
    dbName: "servfix",
    backupRetentionDays: 7,
    retainData: true,
    enableDeletionProtection: true,
    allowedCorsOrigins: ["https://www.servfixgh.com", "https://servfixgh.com"],
    ssmSecrets: {},
  } satisfies EnvironmentConfig,
  staging: {
    name: "staging",
    stackName: "ServfixStaging",
    domainName: "servfixgh.com",
    subdomain: "staging",
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
    allowedCorsOrigins: ["https://staging.servfixgh.com"],
    ssmSecrets: {},
  } satisfies EnvironmentConfig,
} as const;

export const resolveCorsOrigins = (config: EnvironmentConfig) => {
  if (config.allowedCorsOrigins && config.allowedCorsOrigins.length > 0) {
    return config.allowedCorsOrigins;
  }

  const host = config.subdomain ? `${config.subdomain}.${config.domainName}` : config.domainName;
  return [`https://${host}`];
};
