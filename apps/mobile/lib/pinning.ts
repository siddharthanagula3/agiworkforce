/**
 * TLS certificate pinning configuration.
 *
 * **Status (2026-05-14):** SPKI hashes not yet populated; PINNING_ENFORCED
 * remains false. A deploy-time safety guard (`assertPinningReadyIfEnforced`)
 * prevents accidentally flipping PINNING_ENFORCED=true while PINS_BY_HOST
 * still has empty arrays — which would refuse every prod request (brick users).
 *
 * ## Why this isn't pinned today
 *
 * Without certificate pinning, a user-installed test CA, an MDM-managed
 * root, or a malicious Wi-Fi network with a custom root can MITM all of
 * our HTTPS traffic — including the WebSocket signaling relay that carries
 * the WebRTC offer/answer/ice flow. Pinning closes that gap by refusing to
 * talk to a server whose certificate's public-key hash isn't one we know.
 *
 * Pinning was deferred because:
 *   - we don't yet have a documented cert-rotation runbook, and pinning
 *     a single cert without a backup pin makes rotation a forced upgrade,
 *   - the cert export must happen at the same time as the deployment-side
 *     cert provisioning — an ops/SRE step, not a code step.
 *
 * ## Pin-capture runbook (ops, target: 2026-06)
 *
 * 1. Export the SPKI SHA-256 (base64) for each currently-deployed cert.
 *    Run for EACH host: agiworkforce.com, signaling.agiworkforce.com,
 *    your active Supabase project domain, stripe.com (linked checkout).
 *
 *        openssl s_client -servername <HOST> -connect <HOST>:443 \
 *          < /dev/null 2>/dev/null \
 *          | openssl x509 -pubkey -noout \
 *          | openssl pkey -pubin -outform der \
 *          | openssl dgst -sha256 -binary \
 *          | openssl enc -base64
 *
 *    Pin AT LEAST two hashes per domain (primary + rotation candidate).
 *    A single-hash pin forces a forced-upgrade during cert rotation.
 *
 * 2. Drop the hashes into `PINS_BY_HOST` below — replace the empty
 *    arrays with the base64 strings prefixed with `sha256/`.
 *
 * 3. iOS: update `app.json` `expo.ios.infoPlist.NSPinnedDomains` with the
 *    same hashes. Apple URLSession enforces this at the native layer.
 *
 * 4. Android: add the Expo config plugin that writes hashes into
 *    `network_security_config.xml` under `<pin-set>`.
 *
 * 5. Run `assertPinningReadyIfEnforced()` in the app bootstrap to catch
 *    empty-pin deploys before users are affected.
 *
 * 6. Set `PINNING_ENFORCED = true`. Build a release candidate and run the
 *    security smoke test (intercept with a custom CA + assert rejected).
 *
 * 7. Cert rotation: append the NEW pin BEFORE deploying the new cert.
 *    Once the new cert is live for ≥ the longest-installed app TTL,
 *    drop the OLD pin.
 */

/** Prod hosts that MUST have pins before PINNING_ENFORCED can be true. */
const REQUIRED_PINNED_HOSTS = ['agiworkforce.com', 'signaling.agiworkforce.com'] as const;

/**
 * SPKI SHA-256 (base64) hashes per host. **EMPTY = no pinning** for that
 * host. Populate (with ≥2 hashes per host) before flipping PINNING_ENFORCED.
 *
 * TODO(pin-capture-2026-06): replace commented placeholders once ops exports
 * hashes via the runbook above.
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
 * requests to hosts with empty pin arrays are REFUSED (fail-closed).
 *
 * DO NOT flip to true while any required prod host has an empty pin array.
 * Call `assertPinningReadyIfEnforced()` from app bootstrap to guard this.
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

/**
 * Returns whether a given host requires pinning (is a known prod host).
 * Use this in future code paths that need to distinguish pinned vs open hosts.
 */
export function requiresPin(host: string): boolean {
  const normalized = host.toLowerCase();
  return (REQUIRED_PINNED_HOSTS as ReadonlyArray<string>).includes(normalized);
}

/**
 * Deploy-time safety guard. Throws if PINNING_ENFORCED is true but any
 * required prod host still has an empty pin array. Call from app bootstrap
 * so a misconfigured release build fails loudly before users are affected.
 *
 * No-op when PINNING_ENFORCED is false.
 */
export function assertPinningReadyIfEnforced(): void {
  if (!PINNING_ENFORCED) return;

  const unpinned = REQUIRED_PINNED_HOSTS.filter((host) => (PINS_BY_HOST[host] ?? []).length === 0);

  if (unpinned.length > 0) {
    throw new Error(
      `PINNING_ENFORCED=true but PINS_BY_HOST has empty arrays for: ${unpinned.join(', ')}. ` +
        `Follow the pin-capture runbook in lib/pinning.ts before enabling enforcement.`,
    );
  }
}
