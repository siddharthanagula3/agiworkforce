import { afterEach, describe, expect, it } from 'vitest';

import { hasClerkSessionCookie, hasUsableClerkSessionToken } from '../clerk-session';

function jwt(exp: number): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'RS256' })}.${b64({ exp })}.sig`;
}

function setCookies(...pairs: string[]) {
  for (const p of pairs) document.cookie = p;
}

afterEach(() => {
  for (const c of document.cookie.split(';')) {
    document.cookie = `${c.split('=')[0]?.trim()}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
});

describe('clerk session readiness', () => {
  const soon = Math.floor(Date.now() / 1000) + 600;
  const past = Math.floor(Date.now() / 1000) - 600;

  // The bug: __client_uat says signed-in before Clerk has minted __session, so a
  // request fired on the cookie alone answered 401 on every signed-in page load.
  it('reports signed-in from __client_uat while the token is still missing', () => {
    setCookies('__client_uat=1787000000');
    expect(hasClerkSessionCookie()).toBe(true);
    expect(hasUsableClerkSessionToken()).toBe(false);
  });

  it('reports the token usable once __session is present and unexpired', () => {
    setCookies('__client_uat=1787000000', `__session=${jwt(soon)}`);
    expect(hasUsableClerkSessionToken()).toBe(true);
  });

  it('rejects an expired token rather than spending a request on a certain 401', () => {
    setCookies('__client_uat=1787000000', `__session=${jwt(past)}`);
    expect(hasUsableClerkSessionToken()).toBe(false);
  });

  it('rejects a malformed token', () => {
    setCookies('__session=not-a-jwt');
    expect(hasUsableClerkSessionToken()).toBe(false);
  });

  it('is false with no cookies at all', () => {
    expect(hasUsableClerkSessionToken()).toBe(false);
    expect(hasClerkSessionCookie()).toBe(false);
  });
});
