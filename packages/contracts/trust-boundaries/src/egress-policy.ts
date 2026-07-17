/**
 * Our-cloud egress host policy — the ONE shared source of truth for classifying
 * a destination host as belonging to OUR managed cloud infrastructure.
 *
 * Local mode (on-device + BYOK) must NEVER send chats, files, telemetry, or
 * account data to our cloud (web app, API gateway, Vercel, Neon, Clerk). Each
 * surface's egress guard (`guardedFetch`) calls {@link isOurCloudHost} to decide
 * whether to BLOCK a request BEFORE any network I/O. Fail-closed: an unknown or
 * unreadable app mode is treated as Local and blocks our-cloud egress; blocking
 * a request is safe, leaking is not.
 *
 * WHY SHARED: desktop and mobile each defined their own copy and the allowlists
 * DRIFTED — desktop blocked `vercel.app` (mobile didn't); mobile blocked
 * `clerk.dev` + `clerk.services` (desktop didn't). Each surface therefore failed
 * to block some of our-cloud hosts the other blocked — a potential Local-mode
 * leak. This module reconciles both into the safe UNION so every surface blocks
 * every host either used to. Adding a host to this list only ever BLOCKS MORE in
 * Local mode = strictly safer.
 *
 * PLATFORM-FREE: pure TypeScript, no DOM / Node / React-Native imports, so both
 * desktop (Vite/TS) and mobile (RN/TS) can import it. Surface-bound concerns —
 * the `guardedFetch` wrapper, reading the app's privacy mode, the
 * `EgressBlockedError`, and any config-derived hosts — stay in each surface.
 *
 * DO NOT add BYOK provider hosts (api.anthropic.com, api.openai.com,
 * generativelanguage.googleapis.com, api.deepgram.com, …). They are deliberately
 * ABSENT so BYOK client-direct streaming to the user's OWN provider is never
 * blocked — those requests carry the user's own key straight to the provider and
 * our servers never see them.
 */

/**
 * Hostname suffixes that belong to OUR managed cloud infrastructure. Matched by
 * boundary-safe suffix (exact host OR `*.<suffix>`), so `notagiworkforce.com`
 * does NOT match `agiworkforce.com`.
 *
 * Reconciled UNION of desktop + mobile (do not invent — every entry is confirmed
 * from repo config/usage on one or both surfaces):
 *  - `agiworkforce.com` — public web app + `www.`/`api.`/`gateway.`/`signaling.`
 *    subdomains (the API gateway, managed gateway, and signaling relay).
 *  - `vercel.app` — Vercel preview/prod deploys of our web + LLM endpoints.
 *  - `neon.tech` — our managed Postgres (any project/branch subdomain).
 *  - `clerk.com` / `clerk.accounts.dev` / `clerk.dev` / `clerk.services` — our
 *    managed auth provider (Clerk) across its FAPI + accounts domains.
 */
export const OUR_CLOUD_HOSTS: readonly string[] = [
  'agiworkforce.com', // web app + www/api/gateway/signaling subdomains
  'vercel.app', // Vercel-hosted web + LLM endpoints
  'neon.tech', // managed Postgres (Neon)
  'clerk.com', // managed auth (Clerk) — production FAPI
  'clerk.accounts.dev', // managed auth (Clerk) — dev/frontend API
  'clerk.dev', // managed auth (Clerk) — legacy/alt domain
  'clerk.services', // managed auth (Clerk) — service domain
];

/**
 * Normalize a host for comparison: lowercase and strip a single trailing FQDN
 * dot (`agiworkforce.com.` → `agiworkforce.com`). Returns '' for nullish/empty.
 */
function normalizeHost(host: string | null | undefined): string {
  if (!host) return '';
  return host.toLowerCase().replace(/\.$/, '');
}

/**
 * Boundary-safe suffix match: `host` matches an entry `d` only when it equals
 * `d` exactly or ends with `.<d>`. This is the exact algorithm both surfaces
 * used, hoisted here verbatim. It rejects substring/prefix bypasses
 * (`notagiworkforce.com`, `agiworkforce.com.evil.example`, `evilvercel.app`).
 *
 * Exposed so a surface can reuse the SAME matcher for its own config-derived
 * hosts (mobile derives extra hosts from API_URL/WS_URL) on top of the shared
 * floor — see mobile's egressGuard.
 */
export function matchesCloudHost(
  host: string | null | undefined,
  hosts: readonly string[],
): boolean {
  const normalized = normalizeHost(host);
  if (normalized.length === 0) return false;
  return hosts.some((denied) => normalized === denied || normalized.endsWith(`.${denied}`));
}

/**
 * Returns true when `host` is one of OUR managed-cloud hosts (the shared
 * {@link OUR_CLOUD_HOSTS} floor). Boundary-safe suffix match, case-insensitive,
 * trailing-dot-tolerant. Nullish/empty/malformed hosts are NOT-ours (the guard's
 * fail-closed behaviour lives in the surface's mode check, not here).
 */
export function isOurCloudHost(host: string | null | undefined): boolean {
  return matchesCloudHost(host, OUR_CLOUD_HOSTS);
}
