# Mobile Launch Readiness Gate (No-Deploy Checklist)

Last reviewed: 2026-03-05

## Release Decision

Do not launch the native mobile app to production users until every **P0** gate below is passed.

## P0 (Must Pass Before Launch)

1. Deployed backend serves mobile auth endpoints:
   - `POST /api/auth/mobile/register`
   - `POST /api/auth/mobile/login`
   - `POST /api/auth/mobile/google`
   - `POST /api/auth/mobile/refresh`
   - `POST /api/auth/mobile/logout`
2. Deployed payment return page supports mobile handoff:
   - `/payment/verify?...&return_to=mobile` redirects to `servfix://payment/verify?...`
3. Mobile app points to production API by env:
   - `EXPO_PUBLIC_SERVFIX_API_URL=https://www.servfixgh.com`
4. Mobile deep-link domain strategy is consistent:
   - backend/web domain: `servfixgh.com`
   - app links/prefixes include the same production domain
5. Mobile token storage moved from plain AsyncStorage to encrypted secure storage.
6. Android release config is production-safe:
   - release signing key configured (not debug signing)
   - explicit `versionCode` bump policy documented and applied
   - app icon/splash assets finalized
7. End-to-end payment flow passes on real device:
   - sign in
   - checkout redirect
   - deep-link back to app
   - payment verify success state
   - orders refresh reflects paid state

## P1 (Should Pass in First Launch Window)

1. Crash/error telemetry verified for mobile auth and payment return failures.
2. Support runbook includes known payment provider return edge cases.
3. Smoke test script executed against staging + production before store rollout.

## Evidence Snapshot (Current State)

- Production ECS is healthy and serving traffic.
- Production `POST /api/auth/mobile/login` currently returns `404`.
- Local source includes mobile auth routes and mobile payment deep-link logic.
- Deployed asset snapshot still reflects older auth/payment-return code path.

## Verification Commands

Use these checks before any launch decision:

```powershell
Invoke-WebRequest -UseBasicParsing https://www.servfixgh.com/api/health
Invoke-WebRequest -UseBasicParsing -Method Post -ContentType 'application/json' -Body '{}' https://www.servfixgh.com/api/auth/mobile/login
Invoke-WebRequest -UseBasicParsing -Uri 'https://www.servfixgh.com/payment/verify?provider=flutterwave&return_to=mobile'
```

Expected outcomes:

- health endpoint returns `200`
- mobile login endpoint is no longer `404`
- payment verify path redirects to app deep link when `return_to=mobile`
