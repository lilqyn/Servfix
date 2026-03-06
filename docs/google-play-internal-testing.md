# Google Play Internal Testing (Servfix Android)

Last reviewed: 2026-03-05

## Prerequisites

1. Play Console app exists with package `com.servfix.app`.
2. Mobile backend routes are live in target env:
   - `/api/auth/mobile/*` exists (not `404`)
3. Payment return deep-link logic is deployed on web app.
4. You are signed in to Expo/EAS CLI:
   - `npx eas-cli login`

## Option A: Recommended (EAS managed AAB)

From repo root:

```powershell
cd mobile\app
npm install
npm run play:internal
```

What this does:

- Builds Android App Bundle (`.aab`) with profile `internal` from `eas.json`.
- Uses `EXPO_PUBLIC_SERVFIX_API_URL=https://www.servfixgh.com`.

After build completes:

1. Download the `.aab` from EAS build page.
2. Run production pre-release gate from repo root:

```powershell
npm run mobile:precheck:prod
```

3. In Play Console:
   - `Testing` -> `Internal testing` -> `Create release`
   - Upload `.aab`
   - Add release notes
   - Save and roll out
4. Add tester emails/groups and share opt-in link.

### Optional: submit directly to Play from CLI

1. Create a Google Play service account key JSON and save it locally:
   - `mobile/app/keys/play-service-account.json`
2. Run:

```powershell
cd mobile\app
npm run play:submit:internal
```

This submits the latest Android build to the Play internal track using the `submit.internal` profile in `eas.json`.

## Option B: Local signed AAB (manual keystore)

Set signing variables (PowerShell):

```powershell
$env:SERVFIX_UPLOAD_STORE_FILE = "C:\path\to\upload-keystore.jks"
$env:SERVFIX_UPLOAD_STORE_PASSWORD = "..."
$env:SERVFIX_UPLOAD_KEY_ALIAS = "upload"
$env:SERVFIX_UPLOAD_KEY_PASSWORD = "..."
$env:EXPO_PUBLIC_SERVFIX_API_URL = "https://www.servfixgh.com"
```

Build:

```powershell
cd mobile\app
npm install
npm run android:bundle:release
```

Expected output AAB:

- `mobile/app/android/app/build/outputs/bundle/release/app-release.aab`

## Validation Checklist Before Rollout

1. Install internal build from Play.
2. Sign in as buyer.
3. Open order with pending payment.
4. Complete provider checkout.
5. Confirm app deep-link return shows payment success.
6. Confirm orders refresh and payment stage state updates.

## Release Notes Template (Internal Track)

Use this in Play Console release notes:

```text
Servfix internal build [versionName] ([versionCode])

Scope:
- Mobile token auth for buyer/provider accounts
- Checkout return deep-link verification flow
- Orders refresh after payment verification

Environment:
- API: https://www.servfixgh.com
- Backend mobile auth route check: pass

Known limits:
- Admin role remains web-only

Test focus:
- Email/password login
- Pay flow return into app
- Orders status update after payment
```

## Tester Pack Template

Share this with internal testers (email/Slack):

```text
Servfix Android internal build is ready for testing.

Install:
1) Open internal testing opt-in link: [PLAY_OPT_IN_LINK]
2) Accept tester invite
3) Install/update from Play Store listing

Test account:
- Email: [TEST_EMAIL]
- Password: [TEST_PASSWORD]

Test flows:
1) Sign in
2) Open an order with pending payment
3) Complete checkout and return to app
4) Confirm payment verify success screen
5) Confirm order status refreshes

Report format:
- Device model + Android version
- App version (from app settings/about)
- Exact step where issue happened
- Screenshot or screen recording
```

## Failure Cases to Watch

- `404` on `/api/auth/mobile/login` means backend release mismatch.
- Checkout returns to web only and not app means payment return bundle mismatch.
- Release build fails with signing error means keystore env missing (local build path).
