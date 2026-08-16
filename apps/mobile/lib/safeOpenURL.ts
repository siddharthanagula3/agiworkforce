import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

const ALLOWED_HOSTS_EXACT: ReadonlySet<string> = new Set([
  'agiworkforce.com',
  'stripe.com',
  'apps.apple.com',
  'play.google.com',
]);

const ALLOWED_HOST_SUFFIXES: ReadonlyArray<string> = ['.agiworkforce.com', '.stripe.com'];

export function isAllowedExternalUrl(input: unknown): boolean {
  if (typeof input !== 'string' || input.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username !== '' || parsed.password !== '') return false;
  const hostname = parsed.hostname.toLowerCase();
  if (ALLOWED_HOSTS_EXACT.has(hostname)) return true;
  for (const suffix of ALLOWED_HOST_SUFFIXES) {
    if (hostname.endsWith(suffix) && hostname.length > suffix.length) return true;
  }
  return false;
}

export async function openExternalUrl(input: unknown): Promise<boolean> {
  if (!isAllowedExternalUrl(input)) {
    if (__DEV__) {
      console.warn('[safeOpenURL] Refusing to open URL outside allowlist:', input);
    }
    return false;
  }
  try {
    await Linking.openURL(input as string);
    return true;
  } catch {
    return false;
  }
}

const IN_APP_BROWSER_OPTIONS: WebBrowser.WebBrowserOpenOptions = {
  presentationStyle: 'pageSheet' as WebBrowser.WebBrowserPresentationStyle,
  dismissButtonStyle: 'close',
  enableBarCollapsing: true,
  showTitle: true,
};

const IN_APP_BROWSER_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:']);

export function isInAppBrowsableUrl(input: unknown): boolean {
  if (typeof input !== 'string' || input.length === 0) return false;
  try {
    return IN_APP_BROWSER_SCHEMES.has(new URL(input).protocol);
  } catch {
    return false;
  }
}

async function presentInAppBrowser(url: string): Promise<boolean> {
  try {
    await WebBrowser.openBrowserAsync(url, IN_APP_BROWSER_OPTIONS);
    return true;
  } catch {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  }
}

export async function openInAppBrowser(input: unknown): Promise<boolean> {
  if (!isAllowedExternalUrl(input)) {
    if (__DEV__) {
      console.warn('[safeOpenURL] Refusing to open URL outside allowlist:', input);
    }
    return false;
  }
  return presentInAppBrowser(input as string);
}

export async function openUntrustedUrlInAppBrowser(input: unknown): Promise<boolean> {
  if (!isInAppBrowsableUrl(input)) {
    if (__DEV__) {
      console.warn('[safeOpenURL] Refusing to open non-http(s) URL in-app:', input);
    }
    return false;
  }
  return presentInAppBrowser(input as string);
}
