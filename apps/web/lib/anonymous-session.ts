const ANON_SESSION_COOKIE = '__Host-anon-session-id';
const ANON_SESSION_ID_PATTERN =
  /^anon-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Read a single cookie value by name from a Cookie header string.
 *
 * SECURITY (web-HIGH-1, audit 2026-05-05): the previous implementation called
 * `cookies.match(/<name>=([^;]+)/)` with no leading anchor. That regex matches
 * any cookie whose name *ends with* the target · so `x-anon-session-id=evil;
 * anon-session-id=real` returned `evil` (the leftmost match), and an attacker
 * who could plant `crafted-anon-session-id=<known>` via subdomain cookie
 * injection could forge any user's CSRF binding by pre-seeding the value.
 * The fix anchors the match to a cookie-name boundary `(?:^|; )` so the
 * pattern only matches a true cookie name. The cookie-name argument is
 * regex-escaped before interpolation so a caller passing a name with `.`
 * or `*` does not accidentally widen the match.
 *
 * Exported for unit-test access through `lib/csrf.ts`. Treat as internal ·
 * this file and `lib/csrf.ts` should be the only consumers.
 *
 * @internal
 */
export function readCookie(cookieHeader: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|; )${escaped}=([^;]+)`));
  return match?.[1] ?? null;
}

// Only the id shape this server mints is honoured, so a client cannot present a provider user id
// (or any other principal) as its anonymous identity.
function readAnonSessionCookie(cookies: string): string | null {
  const value = readCookie(cookies, ANON_SESSION_COOKIE);
  return value && ANON_SESSION_ID_PATTERN.test(value) ? value : null;
}

// Never consults the identity provider. A route the proxy serves without identity binds its
// tokens here on both the mint and the check; a token minted under identity carries the user
// id and can never verify on such a route.
export function resolveAnonymousSession(request: Request): { id: string; newCookie?: string } {
  const existing = readAnonSessionCookie(request.headers.get('cookie') || '');
  if (existing) {
    return { id: existing };
  }

  const anonId = `anon-${crypto.randomUUID()}`;
  return {
    id: anonId,
    newCookie: `${ANON_SESSION_COOKIE}=${anonId}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=86400`,
  };
}
