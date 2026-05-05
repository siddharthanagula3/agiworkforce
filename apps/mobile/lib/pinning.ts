/**
 * TLS certificate pinning configuration.
 *
 * **Status (2026-05-05):** scaffold only. No SPKI hashes are pinned in
 * production yet. The chokepoint (`services/secureFetch.ts`) is wired into
 * every authenticated outbound HTTPS request, so flipping pinning on is a
 * one-line config change once ops exports the hash.
 *
 * ## Why this isn't pinned today
 *
 * Without certificate pinning, a user-installed test CA, an MDM-managed
 * root, or a malicious Wi-Fi network with a custom root can MITM all of
 * our HTTPS traffic — including the WebSocket signaling relay that
 * carries the WebRTC offer/answer/ice flow. Pinning closes that gap by
 * refusing to talk to a server whose certificate's public-key hash isn't
 * one we know in advance.
 *
 * Pinning was deferred because:
 *   - we don't yet have a documented cert-rotation runbook, and pinning
 *     a single cert without a backup pin makes rotation a forced upgrade,
 *   - the cert export needs to happen at the same time as the
 *     deployment-side cert provisioning, which is an ops/SRE step, not
 *     a code step.
 *
 * ## How to ship pinning end-to-end
 *
 * 1. Export the SPKI SHA-256 (base64) for each currently-deployed cert
 *    of `agiworkforce.com`, `signaling.agiworkforce.com`, the active
 *    Supabase project domain, and the Stripe checkout domain we link out
 *    to. The OpenSSL recipe:
 *
 *        openssl s_client -servername agiworkforce.com -connect agiworkforce.com:443 \
 *          < /dev/null 2>/dev/null \
 *          | openssl x509 -pubkey -noout \
 *          | openssl pkey -pubin -outform der \
 *          | openssl dgst -sha256 -binary \
 *          | openssl enc -base64
 *
 *    Repeat for each rotation candidate. Pin AT LEAST two hashes per
 *    domain so a single rotation isn't a forced-upgrade event.
 *
 * 2. Drop the hashes into `PINS_BY_HOST` below — replace the empty
 *    arrays with the base64 strings.
 *
 * 3. iOS additionally requires `NSPinnedDomains` in Info.plist. Update
 *    `app.json` `expo.ios.infoPlist.NSPinnedDomains` with the same
 *    hashes (Apple's built-in pinning is enforced by URLSession when
 *    this key is present).
 *
 * 4. Android additionally requires `network_security_config.xml`. Add
 *    the Expo config plugin that drops the hashes into the
 *    `<pin-set>` element.
 *
 * 5. Set `PINNING_ENFORCED = true`. Build a release candidate and run
 *    the security smoke test (intercept with a custom CA + assert the
 *    request is rejected).
 *
 * 6. Cert rotation: append the NEW pin to the array BEFORE deploying the
 *    new cert. Once the new cert is live for ≥ the longest-installed
 *    app version's TTL, drop the OLD pin.
 *
 * Until step 5 lands, `secureFetch` is a passthrough — same behaviour as
 * a raw `fetch`, but anchored at one chokepoint so we can audit pin
 * coverage with a single grep (`secureFetch` not `fetch`).
 */

/**
 * SPKI SHA-256 (base64) hashes per host. **EMPTY = no pinning** for that
 * host. Populate before flipping `PINNING_ENFORCED` to true.
 */
export const PINS_BY_HOST: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
  'agiworkforce.com': [
    // 'sha256/REPLACE_WITH_PRIMARY_SPKI_BASE64=',
    // 'sha256/REPLACE_WITH_BACKUP_SPKI_BASE64=',
  ],
  'signaling.agiworkforce.com': [
    // 'sha256/REPLACE_WITH_PRIMARY_SPKI_BASE64=',
    // 'sha256/REPLACE_WITH_BACKUP_SPKI_BASE64=',
  ],
});

/**
 * When false, `secureFetch` is a transparent passthrough. When true,
 * requests to hosts with empty pin arrays are REFUSED (fail-closed). Do
 * not flip without populating PINS_BY_HOST first.
 */
export const PINNING_ENFORCED = false;

/** Returns true when the URL's host has at least one pin configured. */
export function hostHasPins(urlString: string): boolean {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    const pins = PINS_BY_HOST[host];
    return pins !== undefined && pins.length > 0;
  } catch {
    return false;
  }
}

/**
 * Lookup the configured pins for a URL. Returns empty array if no pins
 * are configured for the URL's host (or the URL is malformed). Used by
 * `secureFetch` to decide what to enforce.
 */
export function pinsForUrl(urlString: string): ReadonlyArray<string> {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    return PINS_BY_HOST[host] ?? [];
  } catch {
    return [];
  }
}
