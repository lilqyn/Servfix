# Mobile Launch Patch Plan (No Deploy)

Last reviewed: 2026-03-05

This plan is ordered to reduce launch risk fastest.

## 1) Domain + Deep-Link Alignment (P0)

### Problem

- Mobile navigation prefixes still include `servfix.app`.
- Infrastructure and production web domain are `servfixgh.com`.

### Patch Targets

- `mobile/app/src/navigation/AppNavigator.tsx`
- `mobile/app/app.json`
- `docs/android-native.md`

### Change

- Replace `https://servfix.app` and `https://www.servfix.app` prefixes with `https://servfixgh.com` and `https://www.servfixgh.com`.
- Add Android `intentFilters` in Expo config for host-based links:
  - `https://servfixgh.com/payment/verify`
  - `https://www.servfixgh.com/payment/verify`
- Keep existing custom scheme `servfix://`.

## 2) Production API Binding for Mobile (P0)

### Problem

- Mobile app falls back to localhost/emulator URL unless `EXPO_PUBLIC_SERVFIX_API_URL` is set.

### Patch Targets

- `mobile/app/src/config/env.ts`
- `docs/android-native.md`

### Change

- Keep local fallback for dev.
- Explicitly document production build env:
  - `EXPO_PUBLIC_SERVFIX_API_URL=https://www.servfixgh.com`
- Add release checklist item to block build if env var is unset.

## 3) Secure Token Storage (P0)

### Problem

- Auth tokens are persisted in AsyncStorage, which is not strong enough for production token secrets.

### Patch Targets

- `mobile/app/package.json`
- `mobile/app/src/providers/AuthProvider.tsx`

### Change

- Add `expo-secure-store` dependency.
- Store access/refresh tokens in SecureStore.
- Keep user profile object in AsyncStorage (optional), but tokens must be encrypted storage.

### Suggested Storage Split

- SecureStore keys:
  - `servfix_mobile_access_token`
  - `servfix_mobile_refresh_token`
- AsyncStorage key:
  - `servfix-mobile-user`

## 4) Android Release Hardening (P0)

### Problem

- Native release build currently uses debug signing in generated Android config.
- Versioning strategy is not codified in Expo config.

### Patch Targets

- `mobile/app/app.json`
- `docs/android-native.md`
- `docs/android-twa.md` (only where release/signing process overlaps)

### Change

- Add Android release metadata in Expo config:
  - `android.versionCode` set and incremented per release.
- Document release-signing requirement:
  - no debug signing for production artifact.
- Confirm branding assets are final and bundled.

## 5) Deploy-State Verification (P0)

### Problem

- Local source includes mobile auth + mobile payment-return logic, but production currently returns `404` on mobile auth endpoint.

### Patch Targets

- no code patch required; release validation item

### Change

- Add pre-launch command gate:
  - `POST https://www.servfixgh.com/api/auth/mobile/login` must not return `404`.
  - `https://www.servfixgh.com/payment/verify?provider=flutterwave&return_to=mobile` must deep-link to app.

## Fast Execution Sequence

1. Apply deep-link/domain + app.json intent filter updates.
2. Apply secure token storage refactor.
3. Update docs/runbook with production env and release constraints.
4. Run mobile typecheck.
5. Run backend mobile auth tests.
6. Run device-level payment return E2E.
7. Promote only after production endpoint checks pass.
