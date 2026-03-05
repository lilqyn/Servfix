# SERVFIX Native Android App

This repo now includes a React Native scaffold for a real Android app under `mobile/app`.

## What was added

- Expo-based React Native app shell
- Native stack navigation
- Public service browsing backed by the existing `/api/services` endpoints
- Service detail screen backed by `/api/services/:id`
- Account sign-in screen wired to `/api/auth/mobile/login`
- Mobile token storage and refresh with AsyncStorage

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
npm install
```

For a local backend:

```powershell
$env:EXPO_PUBLIC_SERVFIX_API_URL = "http://10.0.2.2:4000"
npm run android
```

Notes:

- `10.0.2.2` is the Android emulator alias for your host machine.
- For a physical device, set `EXPO_PUBLIC_SERVFIX_API_URL` to a LAN-reachable or public HTTPS URL.
- `npm run android` will generate native Android files through Expo prebuild if they do not already exist.

## Current app scope

- Home
- Browse services
- Service details
- Orders placeholder
- Account placeholder

This is the right cut for a first native milestone: users can discover services natively while the app structure is ready for checkout, messaging, push notifications, and deeper protected flows.

## Next build steps

1. Wire the Orders tab to the protected order endpoints.
2. Add checkout handoff for existing payment providers.
3. Add push notifications and deep links.
4. Add provider messaging and real-time updates.
