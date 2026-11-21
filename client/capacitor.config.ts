import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor Remote URL mode
 * ---------------------------
 * The Android WebView loads the live production CRM.
 * Frontend deploys update the installed app without a new APK.
 *
 * To change the remote host later:
 * 1. Update PRODUCTION_CRM_URL / allowNavigation
 * 2. Run `npx cap sync android`
 * 3. Rebuild / republish the APK or AAB
 */
const PRODUCTION_CRM_URL = 'https://www.smcs.digital';
/** Documented for ops; Axios/Socket use the Vercel-baked VITE_* URLs, not this field. */
const PRODUCTION_API_ORIGIN = 'https://crm-oceh.onrender.com';

// Guard against accidental localhost / Markdown paste in future edits
function assertHttpsOrigin(label: string, value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(trimmed)) {
    throw new Error(`${label} must be a clean https://host origin, got: ${JSON.stringify(value)}`);
  }
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0|\[|\]|\(|\)/i.test(trimmed)) {
    throw new Error(`${label} must not point at localhost or contain Markdown/brackets`);
  }
  return trimmed;
}

const crmUrl = assertHttpsOrigin('PRODUCTION_CRM_URL', PRODUCTION_CRM_URL);
const apiOrigin = assertHttpsOrigin('PRODUCTION_API_ORIGIN', PRODUCTION_API_ORIGIN);

const config: CapacitorConfig = {
  appId: 'com.starmediainfluencer.crm',
  appName: 'Starmediainfluencer',
  // Required by Capacitor tooling; WebView still loads server.url (remote).
  webDir: 'dist',
  server: {
    url: crmUrl,
    cleartext: false,
    androidScheme: 'https',
    // Top-level WebView navigations only — CRM hosts (not API).
    // HTTPS XHR / fetch / WebSocket to Render do NOT need allowNavigation.
    allowNavigation: ['www.smcs.digital', 'smcs.digital'],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0f766e',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f766e',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#f4f5f7',
    webContentsDebuggingEnabled: false,
  },
};

// Keep API origin referenced so misconfiguration fails loudly if edited away.
void apiOrigin;

export default config;
