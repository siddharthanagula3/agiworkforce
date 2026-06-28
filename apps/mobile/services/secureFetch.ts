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
import { PINNING_ENFORCED, pinsAreProvisionedForUrl } from '@/lib/pinning';

export class PinningError extends Error {
  constructor(url: string) {
    super(
      `secureFetch refused: pinning is enforced but no provisioned pins are configured for "${url}". ` +
        `Add provisioned SPKI hashes to lib/pinning.ts → PINS_BY_HOST.`,
    );
    this.name = 'PinningError';
  }
}

/** Options that change *how* the request is dispatched (not what it contains). */
export interface SecureFetchOptions {
  /**
   * Use the streaming-capable fetch implementation. React Native's global
   * `fetch` (whatwg-fetch) does NOT expose a readable `response.body`, so SSE
   * replies can only be read all-at-once via `response.text()` (non-incremental).
   * `expo/fetch` (Expo SDK 55) is a WHATWG-compliant fetch whose `response.body`
   * is a real `ReadableStream`, enabling token-by-token delivery. We opt into it
   * ONLY for streaming requests and keep the platform `fetch` for everything else
   * (multipart uploads, JSON) so well-exercised behaviour is unchanged.
   */
  stream?: boolean;
}

/**
 * Drop-in replacement for `fetch`. Use this everywhere the mobile app
 * makes an outbound HTTPS request.
 */
function normalizeRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export async function secureFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: SecureFetchOptions,
): Promise<Response> {
  const url = normalizeRequestUrl(input);
  if (PINNING_ENFORCED && !pinsAreProvisionedForUrl(url)) {
    throw new PinningError(url);
  }
  // Streaming path → expo/fetch. Streaming callers always pass a URL string/URL
  // (never a Request), and platform TLS pinning (NSPinnedDomains / OkHttp
  // network_security_config) still applies because expo/fetch dispatches through
  // the native URLSession/OkHttp stack — so the pin gate above is unchanged.
  //
  // expo/fetch is required LAZILY: importing it at module scope pulls a native
  // FetchResponse that cannot initialise under Jest (no native runtime), which
  // would break every test that transitively imports secureFetch. On device the
  // native module is present, so the require resolves normally.
  if (opts?.stream && (typeof input === 'string' || input instanceof URL)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fetch: expoFetch } = require('expo/fetch') as typeof import('expo/fetch');
    return expoFetch(url, init as unknown as Parameters<typeof expoFetch>[1]);
  }
  return fetch(input, init);
}
