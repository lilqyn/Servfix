import { App } from "aws-cdk-lib";
import { ServfixStack } from "../lib/servfix-stack.js";
import { environments } from "../lib/config.js";

const app = new App();

const account =
  process.env.CDK_DEFAULT_ACCOUNT ??
  process.env.AWS_ACCOUNT_ID ??
  "258974340169";

const region = "us-east-1";

new ServfixStack(app, environments.prod.stackName, {
  env: { account, region },
  config: environments.prod,
});

new ServfixStack(app, environments.staging.stackName, {
  env: { account, region },
  config: environments.staging,
});
