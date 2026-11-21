# Android app (Capacitor Remote URL)

The Android app is a thin Capacitor shell that loads the **live production CRM**:

- Frontend (WebView `server.url`): `https://www.smcs.digital`
- Backend (Axios / Socket.IO from the live site): `https://crm-oceh.onrender.com`
- `allowNavigation`: CRM hostnames only (`www.smcs.digital`, `smcs.digital`) — API traffic does not use this list

Normal React/UI deploys to Vercel update the installed app **without** a new APK.

Changing the remote URL (or app id) **does** require a new APK/AAB.

## Architecture

| Layer | Source |
| --- | --- |
| UI / auth / modules | Production website (Vercel) |
| API / Socket.IO | Render (`crm-oceh.onrender.com`) |
| Native shell | `client/android` via Capacitor |

Config: `client/capacitor.config.ts`

## Prerequisites

- Node.js 20+
- Android Studio (Ladybug / recent) with Android SDK 36
- JDK 21 (or Studio’s bundled JDK)
- Optional: physical device or emulator

## One-time setup

```bash
cd client
npm install
npx cap sync android
npx cap open android
```

In Android Studio: wait for Gradle sync, then Run on a device.

## Rebuild after native / config changes

```bash
cd client
npx cap sync android
```

Examples that need sync + new APK:

- Edit `server.url` / `allowNavigation` in `capacitor.config.ts`
- Change app icon / splash / permissions
- Add Capacitor plugins

## Debug APK (unsigned / debug key)

From Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**

Or CLI:

```bash
cd client/android
.\gradlew.bat assembleDebug
```

Output:

`client/android/app/build/outputs/apk/debug/app-debug.apk`

## Signed release APK / Play Store AAB

1. Create a keystore (once; keep forever):

```bash
cd client/android
keytool -genkey -v -keystore release.keystore -alias starmediainfluencer -keyalg RSA -keysize 2048 -validity 10000
```

2. Copy `keystore.properties.example` → `keystore.properties` and fill passwords / paths.

3. Build:

```bash
cd client/android
.\gradlew.bat assembleRelease
.\gradlew.bat bundleRelease
```

Outputs:

- APK: `app/build/outputs/apk/release/app-release.apk`
- AAB: `app/build/outputs/bundle/release/app-release.aab` (Play Store)

**Preserve the keystore** — losing it blocks Play Store updates for the same app id.

## Changing the remote CRM URL later

1. Edit `PRODUCTION_CRM_URL` / `allowNavigation` in `client/capacitor.config.ts`
2. Optionally update trusted hosts in `client/src/lib/capacitor.ts`
3. Deploy the web change to Vercel if the domain itself moved
4. `npx cap sync android`
5. Ship a new signed APK/AAB

## Backend checklist (Render)

Ensure Render `CLIENT_URL` includes:

```text
https://www.smcs.digital,https://smcs.digital
```

(and any preview origins you still use)

## Security notes

- HTTPS only (`cleartext: false`, network security config)
- Camera / mic allowed for meetings & uploads (Android permissions + Permissions-Policy `self`)
- External links open in the system browser when possible
- Do not commit `keystore.properties`, `*.jks`, or `*.keystore`

## App identity

| Field | Value |
| --- | --- |
| App name | Starmediainfluencer |
| Application ID | `com.starmediainfluencer.crm` |
| Remote URL | `https://www.smcs.digital` |
