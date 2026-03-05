# Mobile Order-Payment E2E

This guide validates the buyer flow for stage payments (`deposit` / `balance`) in the native Android app.

## Prerequisites

- Android emulator or device connected (`adb devices`)
- Backend API running locally on port `4000` or reachable environment
- Mobile app installed (`com.servfix.app`)

Optional build/install helper:

- Java + Android SDK configured, or use Android Studio defaults

## One-command smoke setup

From repo root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/mobile/runOrderPaymentE2E.ps1
```

To also install a fresh debug build before checks:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/mobile/runOrderPaymentE2E.ps1 -InstallDebug
```

What this script does:

1. Detects `adb` and a connected device.
2. Optionally installs the Android debug build.
3. Runs deep-link checks for `servfix://payment/verify`.
4. Prints a manual E2E checklist for real checkout completion.

## Real checkout validation (manual)

1. Sign in in mobile as a buyer.
2. Go to Orders and open an order with pending stage payment.
3. Tap `Pay initial amount` or `Payable amount`.
4. Complete checkout at provider page.
5. Return to app via deep link.
6. Tap `View orders`.

Pass criteria:

- Payment return screen shows success.
- Orders screen refreshes immediately after tapping `View orders`.
- Order payment stage updates from `pending` to `paid` behaviorally.
