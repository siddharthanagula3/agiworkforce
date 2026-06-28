/**
 * Fast, synchronous signed-out detection for client-side bootstraps.
 *
 * Clerk sets the `__client_uat` cookie to a Unix-seconds timestamp: it is `0`
 * (or absent) when the visitor is signed out and `> 0` when a session exists.
 * This is the same indicator Clerk's own server middleware uses for cheap
 * signed-out detection, so it is safe to rely on before Clerk's JS finishes
 * loading.
 *
 * Use it to gate module-level/bootstrap `/api/me` (or other authenticated)
 * probes: firing them on a signed-out page load returns a guaranteed 401, which
 * the browser logs to the console on every route that runs the bootstrap. The
 * signed-out-quiet contract is enforced by e2e/public-auth-clean.spec.ts.
 *
 * A signed-in user always has `__client_uat > 0` by the time client JS runs, so
 * gating on this never suppresses a real session; any caller can still perform
 * the authenticated fetch explicitly after sign-in.
 */
export function hasClerkSessionCookie(): boolean {
  if (typeof document === 'undefined') return false;
  const match = document.cookie.match(/(?:^|;\s*)__client_uat=([^;]*)/);
  if (!match) return false;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0;
}
