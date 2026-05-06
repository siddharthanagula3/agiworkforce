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
 *     end in `.stripe.com`, or equal `stripe.com` (Stripe Customer Portal
 *     uses subdomains like billing.stripe.com).
 *
 * Returns `true` if the URL passed validation AND `Linking.openURL`
 * succeeded; `false` otherwise. Callers can use the boolean to fall back
 * to a static URL or show an error.
 *
 * The same allowlist that's used here is mirrored on the OAuth flow in
 * `components/auth/OAuthButtons.tsx`, but Stripe is added because the
 * portal flow needs to land on `billing.stripe.com`.
 */
import * as Linking from 'expo-linking';

const ALLOWED_HOSTS_EXACT: ReadonlySet<string> = new Set(['agiworkforce.com', 'stripe.com']);

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
