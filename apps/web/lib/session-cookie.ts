import {
  clerkHasBrowserSessionCookie,
  parseCookieHeader as parseIdentityCookieHeader,
  type IdentityCookie,
} from '@agiworkforce/identity/browser';

export type SessionCookie = IdentityCookie;

export function hasBrowserSessionCookie(cookies: readonly SessionCookie[]): boolean {
  return clerkHasBrowserSessionCookie(cookies);
}

export function parseCookieHeader(cookieHeader: string): SessionCookie[] {
  return parseIdentityCookieHeader(cookieHeader);
}
