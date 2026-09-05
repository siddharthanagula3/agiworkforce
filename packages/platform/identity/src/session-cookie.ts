import type { IdentityCookie } from './types';

export const CLERK_SESSION_COOKIE = '__session';
export const CLERK_CLIENT_UAT_COOKIE = '__client_uat';

const SIGNED_OUT_CLIENT_UAT_VALUES: readonly string[] = ['', '0'];

/**
 * Clerk's own convention for "a browser holds a session": `__client_uat` is the
 * timestamp cookie readable without the session JWT, and an empty or zero
 * value is its signed-out marker. Lives beside the adapter rather than inside
 * it because the browser needs the same answer without loading a server SDK.
 */
export function clerkHasBrowserSessionCookie(cookies: readonly IdentityCookie[]): boolean {
  const clientUat = cookies.find(({ name }) => name === CLERK_CLIENT_UAT_COOKIE)?.value;
  if (clientUat !== undefined) return !SIGNED_OUT_CLIENT_UAT_VALUES.includes(clientUat);
  return cookies.some(({ name }) => name === CLERK_SESSION_COOKIE);
}

export function parseCookieHeader(cookieHeader: string): IdentityCookie[] {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(';')
    .map((pair) => {
      const [rawName, ...rawValueParts] = pair.split('=');
      return { name: rawName?.trim() ?? '', value: rawValueParts.join('=').trim() };
    })
    .filter(({ name }) => Boolean(name));
}
