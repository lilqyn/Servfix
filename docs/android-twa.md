# SERVFIX Android Store Scaffold (TWA First)

This is the lowest-maintenance Android store route because it reuses your live PWA.

## Required Files In This Repo

- `public/manifest.webmanifest`
- `public/sw.js`
- `public/.well-known/assetlinks.json`
- `scripts/mobile/generateAssetLinks.mjs`

## One-Time Prerequisites

- Node.js 18+
- Java 17+
- Android SDK + Android Studio
- Google Play Console account ($25 one-time)

## 1) Set your production values (PowerShell)

```powershell
$env:SERVFIX_APP_ORIGIN = "https://app.servfix.com"
$env:SERVFIX_ANDROID_PACKAGE = "com.servfix.app"
```

Use your real production domain and your final package ID.

## 2) Generate signing keystore

```powershell
mkdir mobile\android\keystore -Force
keytool -genkeypair -v `
  -keystore mobile\android\keystore\upload-keystore.jks `
  -alias servfix-upload `
  -keyalg RSA -keysize 2048 -validity 10000
```

## 3) Read SHA256 fingerprint

```powershell
keytool -list -v `
  -keystore mobile\android\keystore\upload-keystore.jks `
  -alias servfix-upload
```

Copy the `SHA256` value from output.

## 4) Generate Digital Asset Links file

```powershell
$env:SERVFIX_ANDROID_SHA256 = "AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA"
npm run mobile:assetlinks
```

Replace the sample fingerprint with your real value from `keytool`.

This writes `public/.well-known/assetlinks.json`. Deploy this to production so it is reachable at:

`https://your-domain/.well-known/assetlinks.json`

## 5) Build web app

```powershell
npm run build
```

## 6) Initialize TWA project

```powershell
npx @bubblewrap/cli init --manifest "$env:SERVFIX_APP_ORIGIN/manifest.webmanifest"
```

When prompted, use:

- Domain: your production domain
- Application ID: same value as `$env:SERVFIX_ANDROID_PACKAGE`
- Signing key: `mobile/android/keystore/upload-keystore.jks`
- Alias: `servfix-upload`

## 7) Build Android package

```powershell
npm run android:twa:build
```

Bubblewrap outputs an Android App Bundle (`.aab`) ready for Play Console upload.

## 8) Update flow after web app changes

```powershell
npm run build
npm run android:twa:update
npm run android:twa:build
```

## Optional: Capacitor fallback

Use Capacitor only if you need native plugins that TWA cannot provide.

```powershell
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli
npx cap init Servfix com.servfix.app --web-dir=dist
npx cap add android
npm run build
npx cap sync android
npx cap open android
```
