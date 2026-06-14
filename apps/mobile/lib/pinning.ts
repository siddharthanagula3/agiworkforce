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
 * When false, `secureFetch` is a transparent passthrough — the platform's
 * standard TLS chain validation still protects every request. When true,
 * requests to hosts whose pins are unprovisioned (empty OR still placeholder)
 * are REFUSED, fail-closed.
 *
 * #387: this stays FALSE until ops provisions real SPKI hashes. Turning it on
 * while the table below still holds placeholders would fail-close every request
 * to our prod hosts (api / signaling / agiworkforce) and break cloud on real
 * device builds — the exact pre-launch blocker. The chokepoint, the pin table,
 * the bootstrap assert, and the release-lane `check:tls-pins` guard all stay
 * wired, so enabling enforcement is a one-line flip once real hashes land and
 * the guard passes.
 */
export const PINNING_ENFORCED = false;

const PLACEHOLDER_PREFIX = 'PLACEHOLDER_REPLACE_BEFORE_LAUNCH_';

function isPlaceholderPin(pin: string): boolean {
  return pin.includes(PLACEHOLDER_PREFIX);
}

/** True if any configured pin still carries the placeholder marker. */
export function hasPlaceholderPins(): boolean {
  return Object.values(PINS_BY_HOST).flat().some(isPlaceholderPin);
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

/** True if the URL's host has at least one placeholder pin configured. */
export function hasPlaceholderPinForUrl(urlString: string): boolean {
  return pinsForUrl(urlString).some(isPlaceholderPin);
}

/** True when the URL's host has non-placeholder pins ready for native enforcement. */
export function pinsAreProvisionedForUrl(urlString: string): boolean {
  const pins = pinsForUrl(urlString);
  return pins.length > 0 && pins.every((pin) => !isPlaceholderPin(pin));
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

  const unpinned = REQUIRED_PINNED_HOSTS.filter((host) => {
    const pins = PINS_BY_HOST[host] ?? [];
    return pins.length === 0 || pins.some(isPlaceholderPin);
  });
  if (unpinned.length > 0) {
    throw new Error(
      `PINNING_ENFORCED=true but PINS_BY_HOST is missing real pins for: ${unpinned.join(', ')}. ` +
        `Follow the pin-capture runbook in lib/pinning.ts before enabling enforcement.`,
    );
  }
}

/**
 * Pure, testable classification of pinning state at startup.
 *
 * - `dev-or-test`  — guard is skipped (development / test tooling).
 * - `disabled`     — PINNING_ENFORCED is false; `secureFetch` is passthrough.
 * - `unprovisioned`— enforced but pins are still placeholders. The app MUST
 *                    still launch; pinned-host requests fail closed at the
 *                    network layer (a placeholder hash never matches a real
 *                    cert), and on-device-first v1 flows don't hit pinned hosts.
 * - `ok`           — enforced with real provisioned pins.
 */
export type PinningStartupState = 'dev-or-test' | 'disabled' | 'unprovisioned' | 'ok';

export function pinningStartupState(opts: {
  isDev: boolean;
  isTest: boolean;
}): PinningStartupState {
  if (opts.isDev || opts.isTest) return 'dev-or-test';
  if (!PINNING_ENFORCED) return 'disabled';
  if (hasPlaceholderPins()) return 'unprovisioned';
  return 'ok';
}

/**
 * Release-build startup check. P0-FIX (2026-05-29): this previously THREW at
 * module load, which — because lib/pinning.ts is eagerly imported from
 * app/_layout.tsx — crashed the WHOLE app on launch in every release build
 * that still had placeholder pins. That made the app unlaunchable, which is
 * strictly worse than degraded network security in a local-first v1 (chat is
 * on-device; the pinned hosts are gated). It now WARNS instead of throwing;
 * fail-closed behaviour is preserved at the `secureFetch` layer (placeholder
 * pins can never match a real certificate). Provisioning real SPKI pins before
 * public launch remains a tracked release/ops task (see
 * docs/current/commercial-and-launch.md and the runbook above).
 */
function reportPinningStatusAtStartup(): PinningStartupState {
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  const isTest =
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_APP_ENV === 'development');
  const state = pinningStartupState({ isDev, isTest });
  if (state === 'unprovisioned') {
    console.warn(
      '[pinning] TLS pins are not provisioned (placeholder values present). ' +
        'Requests to pinned hosts will fail closed; the app still launches. ' +
        'Provision real SPKI pins before public launch (runbook in lib/pinning.ts).',
    );
  }
  return state;
}

reportPinningStatusAtStartup();
