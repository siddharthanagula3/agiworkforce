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
 */

// The private-boundary predicate lives in stores/privacyBoundary so egressGuard,
// errorTracking, and analytics share ONE implementation (it drifted before — a
// `=== 'local'` check leaked telemetry in BYOK). privacyBoundary → appModeStore is
// the same import edge egressGuard used directly; the cloudAccountAuth → egressGuard
// → appModeStore cycle stays broken on the cloudAccountAuth side (lazy require).
import { isPrivateTrustBoundary } from '../stores/privacyBoundary';

/**
 * Hostname suffixes that belong to OUR cloud infrastructure. Matched by
 * boundary-safe suffix (exact host OR `*.<suffix>`), so `notagiworkforce.com`
 * does NOT match `agiworkforce.com`.
 *
 * Sources (do not invent — confirmed from repo):
 *  - `agiworkforce.com` — public web app (api/config.ts WEB_APP_URL) and the
 *    API gateway `www.agiworkforce.com` (api/config.ts API_BASE_URL) plus the
 *    managed gateway `gateway.agiworkforce.com` (features/chat/index.tsx).
 *  - `vercel.app` — Vercel preview/prod deploys of our web + LLM endpoints
 *    (api/cloudApi.ts comments: "OpenAI-compatible endpoint deployed on Vercel").
 *  - `neon.tech` — our managed Postgres (Neon) — see CLAUDE.md cloud stack.
 *  - `clerk.com` / `clerk.accounts.dev` — our managed auth provider (Clerk).
 *
 * NOTE: BYOK provider hosts (api.anthropic.com, api.openai.com,
 * generativelanguage.googleapis.com, ...) are deliberately ABSENT so BYOK
 * client-direct streaming to the user's own provider is never blocked.
 */
export const OUR_CLOUD_HOSTS: readonly string[] = [
  'agiworkforce.com', // web app + www API gateway + gateway.* managed gateway
  'vercel.app', // Vercel-hosted web + LLM endpoints
  'neon.tech', // managed Postgres
  'clerk.com', // managed auth (Clerk)
  'clerk.accounts.dev', // managed auth (Clerk dev/frontend API)
];

/**
 * Returns true when `host` is one of OUR cloud hosts.
 *
 * Boundary-safe suffix match: a host matches a denylist entry `d` only when it
 * equals `d` exactly or ends with `.<d>`. Comparison is case-insensitive and
 * ignores any trailing dot (FQDN form).
 */
export function isOurCloudHost(host: string | null | undefined): boolean {
  if (!host) return false;
  // Normalize: lowercase, strip a trailing FQDN dot.
  const normalized = host.toLowerCase().replace(/\.$/, '');
  if (normalized.length === 0) return false;
  return OUR_CLOUD_HOSTS.some(
    (denied) => normalized === denied || normalized.endsWith(`.${denied}`),
  );
}

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
