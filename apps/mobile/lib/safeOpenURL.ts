/**
 * Safe wrapper around `Linking.openURL` for external URLs the app receives
 * from a backend response.
 *
 * Why this exists (HIGH-MOB-02 red-team finding 2026-05): three screens
 * (`profile/index.tsx`, `usage.tsx`, `(tabs)/settings.tsx`) all do
 *
 *     const data = await api.post<{ url: string }>('/api/portal');
 *     if (data.url) await Linking.openURL(data.url);
 *
 * with no validation on `data.url`. If the API response is MITM'd (mobile
 * has no certificate pinning today — separate finding HIGH-MOB-04) or the
 * backend is compromised, `data.url` could be:
 *
 *   - `intent://...`       (Android intent laundering — privilege escalation)
 *   - `javascript:...`     (XSS in some in-app browser configurations)
 *   - `file:///...`        (local file disclosure on Android)
 *   - `tel:` / `mailto:`   (phishing surface)
 *   - `https://attacker.com/billing-clone` (credit-card phishing)
 *
 * `Linking.openURL` honors all of those without complaint. This helper
 * enforces a strict allowlist:
 *   - protocol must be exactly `https:`
 *   - hostname must equal `agiworkforce.com`, end in `.agiworkforce.com`,
 *     end in `.stripe.com`, equal `stripe.com`, or equal one of the two
 *     first-party subscription-management hosts used by Apple and Google.
 *
 * Returns `true` if the URL passed validation AND `Linking.openURL`
 * succeeded; `false` otherwise. Callers can use the boolean to fall back
 * to a static URL or show an error.
 *
 * Stripe is included because the portal flow needs to land on
 * `billing.stripe.com`; `apps.apple.com` and `play.google.com` are included
 * only as exact hosts for native subscription management. AGI account routes
 * stay on agiworkforce.com.
 */
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
    // Cast is safe — isAllowedExternalUrl narrowed input to a non-empty
    // string that successfully URL-parsed.
    await Linking.openURL(input as string);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// In-app browser (PAR-M39)
// ---------------------------------------------------------------------------
//
// `Linking.openURL` backgrounds the whole app to hand the URL to Safari /
// Chrome. Tapping Help Center, a security row, or an assistant citation
// therefore dropped the user out of the conversation they were reading and
// made them cold-start back into it.
//
// `expo-web-browser` presents SFSafariViewController / Android Custom Tabs
// inside our process instead: the page renders over the app as a sheet, the
// user dismisses it back onto the exact screen they left, and the page still
// runs in the browser's own sandbox — it never sees our session, storage, or
// JS context. That last property is why untrusted assistant-emitted links are
// safer here than in the system browser, not less safe.

/**
 * Presentation options for every in-app browser sheet.
 *
 * `presentationStyle` is typed as the `WebBrowserPresentationStyle` enum. We
 * write the enum's string value with a cast rather than importing the enum
 * member so this module never touches `expo-web-browser`'s runtime exports at
 * import time — several suites mock the module with `openBrowserAsync` alone.
 */
const IN_APP_BROWSER_OPTIONS: WebBrowser.WebBrowserOpenOptions = {
  presentationStyle: 'pageSheet' as WebBrowser.WebBrowserPresentationStyle,
  dismissButtonStyle: 'close',
  enableBarCollapsing: true,
  showTitle: true,
};

/**
 * Schemes the in-app browser can render. Mirrors the assistant-link
 * classifier in `src/features/chat/utils/externalUrls.ts` — kept local so
 * `lib/` stays free of `src/feature` imports, and so this module can never be
 * handed a `javascript:` / `file:` / `intent:` URL by a future caller that
 * forgot to classify first.
 */
const IN_APP_BROWSER_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:']);

/** True when `input` is an http(s) URL the in-app browser can present. */
export function isInAppBrowsableUrl(input: unknown): boolean {
  if (typeof input !== 'string' || input.length === 0) return false;
  try {
    return IN_APP_BROWSER_SCHEMES.has(new URL(input).protocol);
  } catch {
    return false;
  }
}

/**
 * Presents an already-validated URL in the in-app browser.
 *
 * Falls back to the system browser when the container is unavailable (no
 * Custom Tabs provider installed on Android, or a browser sheet is already
 * presented) — a dead tap would be worse than a backgrounded app.
 */
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

/**
 * Opens a **first-party** URL in the in-app browser, enforcing the same
 * host allowlist as `openExternalUrl`. Use this for our own web pages
 * (Help Center, account/security, privacy, terms).
 *
 * Returns `true` when the URL passed validation AND a browser was presented.
 */
export async function openInAppBrowser(input: unknown): Promise<boolean> {
  if (!isAllowedExternalUrl(input)) {
    if (__DEV__) {
      console.warn('[safeOpenURL] Refusing to open URL outside allowlist:', input);
    }
    return false;
  }
  return presentInAppBrowser(input as string);
}

/**
 * Opens an **untrusted** http(s) URL — an assistant-emitted markdown link or a
 * search citation — in the in-app browser.
 *
 * The host is arbitrary by design (the model can cite any site), so the
 * first-party allowlist does not apply here; the scheme allowlist still does,
 * which is what keeps `javascript:`, `file:` and `intent:` payloads out.
 * Non-http schemes that are legitimate handoffs (`mailto:`, `tel:`, `sms:`,
 * `geo:`) are NOT handled here — they keep their confirmation prompt and go to
 * the system app.
 */
export async function openUntrustedUrlInAppBrowser(input: unknown): Promise<boolean> {
  if (!isInAppBrowsableUrl(input)) {
    if (__DEV__) {
      console.warn('[safeOpenURL] Refusing to open non-http(s) URL in-app:', input);
    }
    return false;
  }
  return presentInAppBrowser(input as string);
}
