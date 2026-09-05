import { describe, expect, it } from 'vitest';

import {
  CLERK_CLIENT_UAT_COOKIE,
  CLERK_SESSION_COOKIE,
  clerkHasBrowserSessionCookie,
  parseCookieHeader,
} from '../session-cookie';

describe('browser session cookie', () => {
  it('treats a positive client uat as a live session', () => {
    expect(
      clerkHasBrowserSessionCookie([{ name: CLERK_CLIENT_UAT_COOKIE, value: '1735689600' }]),
    ).toBe(true);
  });

  it('treats an empty or zero client uat as signed out even when a session cookie exists', () => {
    for (const value of ['', '0']) {
      expect(
        clerkHasBrowserSessionCookie([
          { name: CLERK_CLIENT_UAT_COOKIE, value },
          { name: CLERK_SESSION_COOKIE, value: 'jwt' },
        ]),
      ).toBe(false);
    }
  });

  it('falls back to the session cookie when no client uat is present', () => {
    expect(clerkHasBrowserSessionCookie([{ name: CLERK_SESSION_COOKIE, value: 'jwt' }])).toBe(true);
    expect(clerkHasBrowserSessionCookie([])).toBe(false);
  });

  it('parses a cookie header, keeping values that contain an equals sign', () => {
    expect(parseCookieHeader('__client_uat=1; __session=a=b')).toEqual([
      { name: '__client_uat', value: '1' },
      { name: '__session', value: 'a=b' },
    ]);
    expect(parseCookieHeader('')).toEqual([]);
  });
});
