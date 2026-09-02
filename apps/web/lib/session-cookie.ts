export interface SessionCookie {
  name: string;
  value: string;
}

// Clerk sets __client_uat to a Unix timestamp when a session exists and to
// "0" when signed out; that is the one cookie whose value (not just its
// presence) tells the truth. Every other clerk-prefixed cookie
// (__clerk_db_jwt, __clerk_handshake, ...) is set for anonymous dev-browser
// visitors too, so matching on name alone flagged every visitor who had ever
// completed Clerk's dev handshake as signed in. Mirrors the value check
// apps/web/lib/clerk-session.ts already does client-side from
// document.cookie; this is the same predicate for a Headers/cookie-jar input
// (proxy.ts's NextRequest.cookies, or this file's own document.cookie
// parser), so both the '/' rewrite and the client Header agree with it.
export function hasBrowserSessionCookie(cookies: readonly SessionCookie[]): boolean {
  const clientUat = cookies.find(({ name }) => name === '__client_uat')?.value;
  if (clientUat !== undefined) return clientUat !== '' && clientUat !== '0';
  return cookies.some(({ name }) => name === '__session');
}

export function parseCookieHeader(cookieHeader: string): SessionCookie[] {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(';')
    .map((pair) => {
      const [rawName, ...rawValueParts] = pair.split('=');
      return { name: rawName?.trim() ?? '', value: rawValueParts.join('=').trim() };
    })
    .filter(({ name }) => Boolean(name));
}
