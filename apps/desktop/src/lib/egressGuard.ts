/**
 * Central Egress Guard (Zero-Leak Chokepoint)
 *
 * Single enforcement point for OUR-cloud network egress. In Local mode the
 * desktop app must never send chats, files, telemetry, or account data to our
 * cloud infrastructure (web app, API gateway, Vercel, Neon, Clerk). BYOK
 * client-direct streaming to the user's OWN provider (Anthropic, OpenAI,
 * Google, etc.) must still work, so provider hosts are intentionally NOT on the
 * denylist.
 *
 * Trust-boundary mapping (see `selectPrivacyMode` in
 * apps/desktop/src/stores/appModeStore.ts):
 *   privacyMode 'managed' (appMode 'cloud' + no BYOK keys) -> our-cloud ALLOWED
 *   privacyMode 'local'   (appMode 'local')               -> our-cloud BLOCKED
 *   privacyMode 'byok'    (appMode 'cloud' + BYOK keys)    -> our-cloud BLOCKED
 *
 * CRITICAL: BYOK runs under appMode `'cloud'` (it is `cloud` + a `'cloud'`
 * providerMode in settingsStore), NOT under appMode `'local'`. So a naive
 * `mode !== 'cloud'` check would WRONGLY permit our-cloud egress in BYOK mode.
 * The guard therefore branches on the canonical 3-tier `selectPrivacyMode` and
 * blocks whenever it is not `'managed'` (i.e. Local OR BYOK).
 *
 * FAIL-CLOSED: if the mode cannot be read for any reason, we treat the session
 * as Local and block our-cloud egress. Blocking a request is safe; leaking is
 * not.
 *
 * SCOPE (do not over-trust): this is the WebView/TS-layer chokepoint — it wraps
 * `fetch` (`guardedFetch`), where chats, files, telemetry, and account calls
 * originate today. It does NOT intercept the Tauri Rust backend's own `reqwest`
 * calls; those sit OUTSIDE this guard and must honor the trust boundary on their
 * own. As of 2026-06-25 the Rust paths that can reach our cloud are: account/auth
 * (infra, SSRF-allowlisted to `*.agiworkforce.com` in `sys/account/mod.rs`) and a
 * DORMANT cloud-sync/device client (`integrations/sync` — declared but never
 * instantiated or exposed via a Tauri command, so it does not egress in practice).
 * If that sync client is ever wired up, gate it on `privacyMode === 'managed'` the
 * same way this guard does. See known-flaws and the Rust-egress audit.
 */

// The private-boundary predicate lives in stores/privacyBoundary so egressGuard,
// errorTracking, and analytics share ONE implementation (it drifted before — a
// `=== 'local'` check leaked telemetry in BYOK). privacyBoundary → appModeStore is
// the same import edge egressGuard used directly; the cloudAccountAuth → egressGuard
// → appModeStore cycle stays broken on the cloudAccountAuth side (lazy require).
import { isPrivateTrustBoundary } from '../stores/privacyBoundary';
// Host policy lives in ONE shared module (@agiworkforce/services) so desktop and
// mobile can never drift apart again — they used to define separate denylists
// and each failed to block some of our-cloud hosts the other blocked. The
// reconciled UNION + the boundary-safe suffix matcher are shared; only the
// platform-bound guardedFetch wrapper + privacy-mode read stay here.
import { OUR_CLOUD_HOSTS, isOurCloudHost } from '@agiworkforce/services';

// Re-export so existing desktop importers (and the egress tests) keep their
// `../lib/egressGuard` import path.
export { OUR_CLOUD_HOSTS, isOurCloudHost };

/**
 * True when we are in a Local trust boundary (Local OR BYOK) and must block
 * our-cloud egress. Delegates to the shared `isPrivateTrustBoundary` so the
 * predicate stays in one place (fail-closed on an unreadable store).
 */
function isLocalMode(): boolean {
  return isPrivateTrustBoundary();
}

/**
 * Extracts the hostname from a fetch input. Returns null when no host can be
 * determined (e.g. a relative URL with no document base). Desktop callers use
 * absolute URLs, so a parse failure here is an unexpected, suspicious case.
 */
function extractHost(input: RequestInfo | URL): string | null {
  try {
    if (typeof input === 'string') {
      return new URL(input).hostname;
    }
    if (input instanceof URL) {
      return input.hostname;
    }
    // Request object.
    if (typeof Request !== 'undefined' && input instanceof Request) {
      return new URL(input.url).hostname;
    }
    // Fallback: object with a `url` property (Request-like).
    const maybeUrl = (input as { url?: unknown }).url;
    if (typeof maybeUrl === 'string') {
      return new URL(maybeUrl).hostname;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Guarded replacement for `fetch`. In Local/BYOK mode, throws BEFORE any
 * network call if the target is one of OUR cloud hosts. Otherwise delegates to
 * the global `fetch`. BYOK provider hosts are not on the denylist, so they pass.
 *
 * @throws Error when an our-cloud egress is attempted in Local mode.
 */
export async function guardedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (isLocalMode()) {
    const host = extractHost(input);
    if (isOurCloudHost(host)) {
      throw new Error(`[egress-guard] blocked our-cloud egress in Local mode: ${host}`);
    }
  }
  return fetch(input, init);
}
