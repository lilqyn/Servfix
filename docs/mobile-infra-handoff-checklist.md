# Mobile Release + Infra Handoff Checklist

Last reviewed: 2026-03-05

This runbook is for staging and production validation before mobile rollout.

## 0) Automated Gate (Recommended)

From repo root:

```powershell
npm run mobile:precheck
```

Env-specific:

```powershell
npm run mobile:precheck:staging
npm run mobile:precheck:prod
```

Expected:

- Every check prints `[PASS]`.
- Script exits with code `0`.
- Any `[FAIL]` means no-go until fixed.

## 1) Mobile Build Environment

### Staging build env

```powershell
cd mobile\app
$env:EXPO_PUBLIC_SERVFIX_API_URL = "https://staging.servfixgh.com"
```

### Production build env

```powershell
cd mobile\app
$env:EXPO_PUBLIC_SERVFIX_API_URL = "https://www.servfixgh.com"
```

Expected:

- `EXPO_PUBLIC_SERVFIX_API_URL` points to the target environment.
- No release build should run with localhost/emulator fallback.
- Release build should fail fast if URL is missing, non-HTTPS, or localhost/`10.0.2.2`.

## 2) CloudFormation Stack Health

### Staging

```powershell
aws cloudformation describe-stacks --stack-name ServfixStaging --query "Stacks[0].[StackStatus,LastUpdatedTime]" --output text
```

Expected:

- `StackStatus` is `UPDATE_COMPLETE`.

### Production

```powershell
aws cloudformation describe-stacks --stack-name ServfixProd --query "Stacks[0].[StackStatus,LastUpdatedTime]" --output text
```

Expected:

- `StackStatus` is `UPDATE_COMPLETE`.

## 3) ECS Service Health

### Staging

```powershell
aws ecs describe-services --cluster ServfixStaging-ClusterEB0386A7-IGsrdTzU8CTq --services ServfixStaging-Service9571FDD8-gOEomt7tOgv9 --query "services[0].[status,desiredCount,runningCount,taskDefinition]" --output text
```

Expected:

- `status` is `ACTIVE`
- `desiredCount` equals `runningCount`

### Production

```powershell
aws ecs describe-services --cluster ServfixProd-ClusterEB0386A7-5FsHCd5pVCRJ --services ServfixProd-Service9571FDD8-iQkdyUEBv0nw --query "services[0].[status,desiredCount,runningCount,taskDefinition]" --output text
```

Expected:

- `status` is `ACTIVE`
- `desiredCount` equals `runningCount`

## 4) Running Image Tag Check

### Staging

```powershell
$stagingTaskDefArn = aws ecs describe-services --cluster ServfixStaging-ClusterEB0386A7-IGsrdTzU8CTq --services ServfixStaging-Service9571FDD8-gOEomt7tOgv9 --query "services[0].taskDefinition" --output text
aws ecs describe-task-definition --task-definition $stagingTaskDefArn --query "taskDefinition.containerDefinitions[0].image" --output text
```

### Production

```powershell
$prodTaskDefArn = aws ecs describe-services --cluster ServfixProd-ClusterEB0386A7-5FsHCd5pVCRJ --services ServfixProd-Service9571FDD8-iQkdyUEBv0nw --query "services[0].taskDefinition" --output text
aws ecs describe-task-definition --task-definition $prodTaskDefArn --query "taskDefinition.containerDefinitions[0].image" --output text
```

Expected:

- Image tags match the intended release artifact tags.

## 5) Live API Gate Checks

### Staging health + mobile auth route

```powershell
Invoke-WebRequest -UseBasicParsing https://staging.servfixgh.com/api/health
Invoke-WebRequest -UseBasicParsing -Method Post -ContentType 'application/json' -Body '{}' https://staging.servfixgh.com/api/auth/mobile/login
```

### Production health + mobile auth route

```powershell
Invoke-WebRequest -UseBasicParsing https://www.servfixgh.com/api/health
Invoke-WebRequest -UseBasicParsing -Method Post -ContentType 'application/json' -Body '{}' https://www.servfixgh.com/api/auth/mobile/login
```

Expected:

- `/api/health` returns `200`.
- `/api/auth/mobile/login` must not return `404`.
- For empty body, `400/401` is acceptable because route exists and validation/auth fails.

## 6) Payment Return Mobile Handoff Check

HTTP alone cannot fully validate client-side deep-link redirect logic. Run device-level check:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/mobile/runOrderPaymentE2E.ps1
```

Expected:

- Script finishes without errors.
- Deep-link smoke checks open `servfix://payment/verify`.
- Manual E2E checklist confirms payment return and orders refresh.

## 7) Final Go/No-Go Criteria

Go only if all are true:

1. Stack + ECS health checks pass on target environment.
2. Mobile auth route exists in target environment (`/api/auth/mobile/login` not `404`).
3. Device-level payment return handoff works.
4. Mobile build uses correct `EXPO_PUBLIC_SERVFIX_API_URL`.
