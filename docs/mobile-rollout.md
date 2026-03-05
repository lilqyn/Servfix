# SERVFIX Mobile Rollout (Cheapest-First)

This plan ships a mobile app experience with the lowest upfront cost by using the existing web app as a Progressive Web App (PWA), then adding app stores only when needed.

## 1. Cost Order

1. PWA from the website: $0 store fees
2. Android Play Store (Trusted Web Activity or Capacitor wrapper): $25 one-time
3. iOS App Store (Capacitor wrapper): $99/year

## 2. What Is Already Implemented

- Web manifest: `public/manifest.webmanifest`
- Service worker: `public/sw.js`
- Install prompt UI: `src/components/pwa/InstallPrompt.tsx`
- Install prompt mounted globally: `src/App.tsx`
- Mobile/PWA metadata in HTML shell: `index.html`

## 3. 7-Day Delivery Plan

### Day 1
- Confirm production API URL and CORS for the public web domain.
- Verify HTTPS is enabled on the frontend domain.

### Day 2
- Run PWA checks in Chrome DevTools (Manifest + Service Worker).
- Validate install flow on Android Chrome.
- Validate "Add to Home Screen" flow on iPhone Safari.

### Day 3
- Run quick offline checks:
  - First load online, then switch offline and verify shell loads.
  - Verify key static screens still render.
- Test auth/session behavior after app is launched from home screen.

### Day 4
- Add/update production app icons and splash assets if branding changed.
- Review install prompt copy and close behavior for clarity.

### Day 5
- Soft launch as PWA to a limited user group.
- Capture install-rate, sign-in success, and crash/error telemetry.

### Day 6
- Fix onboarding friction from pilot feedback.
- Freeze PWA build for public release.

### Day 7
- Public PWA launch.
- Start Android store packaging only if needed for distribution/visibility.

## 4. Android Store (Optional Next Step)

Use a wrapper so the same web app powers Android:

1. Keep PWA hosted on your HTTPS production domain.
2. Create signing key.
3. Generate Android package with Bubblewrap (TWA) or Capacitor.
4. Publish to Google Play Console ($25 one-time account).

TWA is usually the lowest ongoing maintenance because it uses your live web app.
Detailed scaffold and commands: `docs/android-twa.md`.

## 5. iOS Store (Optional Later Step)

iOS does not support TWA. For App Store distribution:

1. Wrap the web app with Capacitor iOS.
2. Build and sign in Xcode.
3. Submit using Apple Developer Program ($99/year).

If budget is tight, keep iOS on Safari "Add to Home Screen" first, then move to App Store later.

## 6. Validation Commands

```bash
npm run lint
npm run test
npm run build
```

If all pass and production HTTPS is live, SERVFIX is ready for PWA launch.
