/**
 * Single chokepoint for all outbound HTTPS requests from the mobile app.
 *
 * **Why this exists:** the FIX-MOB-10 / HIGH-MOB-04 red-team finding
 * (TLS not pinned) requires every fetch to flow through one place so
 * that:
 *   1. a single grep reveals every outbound site;
 *   2. when ops exports SPKI hashes, flipping pinning on is a one-line
 *      change in `lib/pinning.ts` (no need to chase 50 fetch call sites);
 *   3. tests can intercept the chokepoint to assert that a specific
 *      request is rejected when pinning is enforced.
 *
 * Today this is a transparent passthrough to `fetch`. Once
 * `PINNING_ENFORCED` is flipped on in `lib/pinning.ts` (after SPKI
 * hashes are dropped in), the behaviour changes to:
 *   - hosts with configured pins → request proceeds; the platform's
 *     URLSession (iOS, via NSPinnedDomains) / OkHttp + network_security_config
 *     (Android) actually enforce the pin. JS-side this stays a fetch call
 *     because RN's bridge can't introspect TLS.
 *   - hosts with no pins → request is REFUSED with a thrown error so a
 *     forgotten pin entry can't silently let traffic through.
 *
 * The "actually pin" step happens at the platform layer; this module is
 * the JS-side gate that prevents pin-coverage drift.
 */
import { PINNING_ENFORCED, pinsForUrl } from '@/lib/pinning';

export class PinningError extends Error {
  constructor(url: string) {
    super(
      `secureFetch refused: pinning is enforced but no pins are configured for "${url}". ` +
        `Add SPKI hashes to lib/pinning.ts → PINS_BY_HOST.`,
    );
    this.name = 'PinningError';
  }
}

/**
 * Drop-in replacement for `fetch`. Use this everywhere the mobile app
 * makes an outbound HTTPS request.
 */
export async function secureFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input.url;
  if (PINNING_ENFORCED && pinsForUrl(url).length === 0) {
    throw new PinningError(url);
  }
  return fetch(input, init);
}
