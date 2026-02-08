# Servfix AWS CDK

## Prereqs
- AWS CLI configured for the target account
- Docker Desktop running
- Node.js 18+

## Configure
1. Open infra/lib/config.ts and set hostedZoneId for prod and staging.
2. Update instance sizes, desired counts, or subdomains if needed.
3. Optional: add payment secrets via SSM by setting ssmSecrets in config.
4. Flutterwave secrets can be sourced from SSM by setting:
   - `SERVFIX_STAGING_FLUTTERWAVE_SECRET_KEY_PARAM`
   - `SERVFIX_STAGING_FLUTTERWAVE_WEBHOOK_HASH_PARAM`
   - `SERVFIX_PROD_FLUTTERWAVE_SECRET_KEY_PARAM`
   - `SERVFIX_PROD_FLUTTERWAVE_WEBHOOK_HASH_PARAM`

## Bootstrap
```bash
cd infra
npm install
npm run bootstrap -- aws://ACCOUNT_ID/us-east-1
```

## Deploy
```bash
npm run cdk -- deploy ServfixStaging
npm run cdk -- deploy ServfixProd
```

## Database URL
The stack creates a Secrets Manager entry for DATABASE_URL.

```bash
aws secretsmanager get-secret-value --secret-id <DatabaseUrlSecretArn> --query SecretString --output text
```

## Migrations
Use the DATABASE_URL value to run migrations:

```bash
DATABASE_URL="..." npx prisma migrate deploy
```
