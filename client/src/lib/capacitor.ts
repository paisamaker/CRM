/**
 * Capacitor native bridge helpers.
 * Safe on web (Vercel / desktop): all calls no-op when not running inside the Android app.
 * Deployed with the CRM so the Remote URL WebView gets back-button + chrome polish.
 */
import { Capacitor } from '@capacitor/core';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function isAndroidApp(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** In-app CRM hosts (match capacitor.config.ts allowNavigation). API is XHR-only. */
const TRUSTED_CRM_HOSTS = new Set(['www.smcs.digital', 'smcs.digital']);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isTrustedCrmUrl(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return TRUSTED_CRM_HOSTS.has(host);
}

/**
 * Initialize native UX when running inside Capacitor.
 * Call once from main.tsx.
 */
export async function initCapacitorApp(): Promise<void> {
  if (!isNativeApp()) return;

  try {
    const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
      import('@capacitor/app'),
      import('@capacitor/status-bar'),
      import('@capacitor/splash-screen'),
    ]);

    await StatusBar.setBackgroundColor({ color: '#0f766e' }).catch(() => undefined);
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
    await SplashScreen.hide().catch(() => undefined);

    // Hardware back: navigate history first, exit only on root
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack || window.history.length > 1) {
        window.history.back();
        return;
      }
      void App.exitApp();
    });

    // Open non-CRM links in the system browser
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target as HTMLElement | null;
        const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
        if (!anchor?.href) return;
        if (anchor.target === '_blank' || !isTrustedCrmUrl(anchor.href)) {
          const href = anchor.href;
          if (!href.startsWith('http://') && !href.startsWith('https://')) return;
          if (isTrustedCrmUrl(href) && anchor.target !== '_blank') return;
          event.preventDefault();
          void import('@capacitor/browser').then(({ Browser }) =>
            Browser.open({ url: href })
          );
        }
      },
      true
    );
  } catch (err) {
    // Never break the CRM if a native plugin fails
    console.warn('[capacitor] init skipped', err);
  }
}
