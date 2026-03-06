# SERVFIX Native Android App

This repo now includes a React Native scaffold for a real Android app under `mobile/app`.

## What was added

- Expo-based React Native app shell
- Native stack navigation
- Public service browsing backed by the existing `/api/services` endpoints
- Service detail screen backed by `/api/services/:id`
- Account sign-in screen wired to `/api/auth/mobile/login`
- Mobile token storage with SecureStore and backward migration from legacy AsyncStorage sessions

## Why React Native here

The existing product is already React and TypeScript. React Native is the fastest path to a real Android app while keeping the same team skills, data models, and API contracts.

## Important backend note

The backend now has a parallel mobile auth path that does not replace the existing web cookie flow:

- Web keeps using `/api/auth/login`, `/api/auth/refresh`, and cookies.
- Mobile uses `/api/auth/mobile/login`, `/api/auth/mobile/refresh`, and bearer tokens.

This keeps future web changes isolated while giving the Android app a native-friendly session model.

Admin accounts remain web-only. Mobile auth is intended for buyer and provider roles.

## Run the app

From the repo root:

```powershell
cd mobile\app
nvm use
npm install
```

For emulator development with local backend:

```powershell
$env:EXPO_PUBLIC_SERVFIX_API_URL = "http://10.0.2.2:4000"
npm run dev:adb-reverse
npm run dev:metro
```

Equivalent root command:

```powershell
$env:EXPO_PUBLIC_SERVFIX_API_URL = "http://10.0.2.2:4000"
npm run mobile:dev:emulator
```

Notes:

- `10.0.2.2` is the Android emulator alias for your host machine.
- `.nvmrc` in this repo pins Node `20` for stable Expo/Metro behavior.
- If `nvm` is not installed, `npm run dev:metro` still forces Node 20 via `npx -y node@20 ...`.
- If `adb` is not on `PATH`, use the full SDK path (example: `C:\Users\User\AppData\Local\Android\Sdk\platform-tools\adb.exe`).
- For a physical device, set `EXPO_PUBLIC_SERVFIX_API_URL` to a LAN-reachable or public HTTPS URL.
- Use `npm run android` when you need to (re)build/install the debug APK.

## Current app scope

- Home
- Browse services
- Service details
- Sign in / sign up with mobile token auth
- Orders list with status filters and payment actions
- Payment return verification screen for deep-link checkout return
- Account screen with session state and sign-out

This app now supports a real authenticated buyer/provider flow with checkout handoff and payment-return verification on mobile.

## Next build steps

1. Set production mobile API env for release builds:
   - `EXPO_PUBLIC_SERVFIX_API_URL=https://www.servfixgh.com`
   - Release builds now fail fast if this env is missing, not HTTPS, or set to localhost/`10.0.2.2`.
2. Configure Android release signing (Play upload key):
   - `SERVFIX_UPLOAD_STORE_FILE`
   - `SERVFIX_UPLOAD_STORE_PASSWORD`
   - `SERVFIX_UPLOAD_KEY_ALIAS`
   - `SERVFIX_UPLOAD_KEY_PASSWORD`
   - Release Gradle tasks now fail fast when signing is not configured.
3. Harden token lifecycle (expiry telemetry, forced logout handling, key rotation plan).
4. Add push notifications and in-app messaging.
5. Add provider messaging and real-time updates.
