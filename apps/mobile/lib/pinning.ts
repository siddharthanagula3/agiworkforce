// AUDIT-FIX: C-7 — TLS certificate pinning enforced; placeholder pins block
// release builds until ops provisions real SPKI SHA-256 hashes.
/**
 * TLS certificate pinning configuration.
 *
 * ## Why this matters
 *
 * Without certificate pinning, a user-installed test CA, an MDM-managed
 * root, or a malicious Wi-Fi network with a custom root can MITM all of
 * our HTTPS traffic — including the WebSocket signaling relay that carries
 * the WebRTC offer/answer/ice flow. Pinning closes that gap by refusing to
 * talk to a server whose certificate's public-key hash isn't one we know.
 *
 * ## Pin-capture runbook (ops)
 *
 * 1. Export the SPKI SHA-256 (base64) for each currently-deployed cert.
 *    Run for EACH host:
 *
 *        openssl s_client -servername <HOST> -connect <HOST>:443 \
 *          < /dev/null 2>/dev/null \
 *          | openssl x509 -pubkey -noout \
 *          | openssl pkey -pubin -outform der \
 *          | openssl dgst -sha256 -binary \
 *          | openssl enc -base64
 *
 *    Pin AT LEAST two hashes per domain (primary + intermediate).
 *    A single-hash pin forces a forced-upgrade during cert rotation.
 *
 * 2. Replace the `PLACEHOLDER_REPLACE_BEFORE_LAUNCH_*` strings below with
 *    the real `sha256/...=` strings.
 *
 * 3. iOS: update `app.config.js` `ios.infoPlist.NSPinnedDomains` with the
 *    same hashes. Apple URLSession enforces this at the native layer.
 *
 * 4. Android: add the Expo config plugin that writes hashes into
 *    `network_security_config.xml` under `<pin-set>`.
 *
 * 5. Cert rotation: append the NEW pin BEFORE deploying the new cert.
 *    Once the new cert is live for ≥ the longest-installed app TTL,
 *    drop the OLD pin.
 */

/** Prod hosts that MUST have pins before PINNING_ENFORCED can be true. */
const REQUIRED_PINNED_HOSTS = [
  'agiworkforce.com',
  'signaling.agiworkforce.com',
  'api.agiworkforce.com',
  'api.openai.com',
  'api.anthropic.com',
] as const;

/**
 * SPKI SHA-256 (base64) hashes per host. Each host carries TWO pins:
 *   - leaf (current cert) and intermediate (rotation candidate).
 *
 * Strings prefixed `PLACEHOLDER_REPLACE_BEFORE_LAUNCH_` are blockers — the
 * release-build guard at module load throws when any survive.
 */
export const PINS_BY_HOST: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
  'agiworkforce.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_agiworkforce_leaf=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_agiworkforce_intermediate=',
  ],
  'signaling.agiworkforce.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_signaling_leaf=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_signaling_intermediate=',
  ],
  'api.agiworkforce.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_api_leaf=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_api_intermediate=',
  ],
  'api.openai.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_openai_leaf=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_openai_intermediate=',
  ],
  'api.anthropic.com': [
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_anthropic_leaf=',
    'sha256/PLACEHOLDER_REPLACE_BEFORE_LAUNCH_anthropic_intermediate=',
  ],
});

/**
 * When false, `secureFetch` is a transparent passthrough. When true,
 * requests to hosts with empty pin arrays are REFUSED (fail-closed).
 *
 * AUDIT-FIX: C-7 — flipped to true. Release builds with placeholder pins
 * fail at module load (see {@link enforceProvisionedPinsForRelease} below).
 */
export const PINNING_ENFORCED = true;

const PLACEHOLDER_PREFIX = 'PLACEHOLDER_REPLACE_BEFORE_LAUNCH_';

/** True if any configured pin still carries the placeholder marker. */
export function hasPlaceholderPins(): boolean {
  return Object.values(PINS_BY_HOST)
    .flat()
    .some((h) => h.includes(PLACEHOLDER_PREFIX));
}

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
 * are configured for the URL's host (or the URL is malformed).
 */
export function pinsForUrl(urlString: string): ReadonlyArray<string> {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    return PINS_BY_HOST[host] ?? [];
  } catch {
    return [];
  }
}

/** True if a given host is one of the known prod hosts that requires pins. */
export function requiresPin(host: string): boolean {
  const normalized = host.toLowerCase();
  return (REQUIRED_PINNED_HOSTS as ReadonlyArray<string>).includes(normalized);
}

/**
 * Deploy-time safety guard. Throws if PINNING_ENFORCED is true but any
 * required prod host has no pins. Call from app bootstrap so a
 * misconfigured release fails loudly before users are affected.
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

/**
 * Release-build launch blocker. Throws when running outside __DEV__ and the
 * placeholder pins are still in place — better than silent fail-open.
 *
 * Evaluated at module load so a broken release build fails before any UI
 * mounts.
 */
function enforceProvisionedPinsForRelease(): void {
  // Test environments and dev tooling should NOT trip the placeholder guard.
  if (typeof __DEV__ !== 'undefined' && __DEV__) return;
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') return;
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_APP_ENV === 'development') return;
  if (PINNING_ENFORCED && hasPlaceholderPins()) {
    throw new Error('TLS pinning not provisioned');
  }
}

enforceProvisionedPinsForRelease();
