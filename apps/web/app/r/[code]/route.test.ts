import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from './route';
import {
  REFERRAL_ATTRIBUTION_COOKIE,
  REFERRAL_PROGRAM,
  REFERRAL_WELCOME_PATH,
} from '@/lib/services/referral-program';
import { AUTH_SIGNUP_PATH } from '@/features/auth/authRoutes';

function visit(code: string) {
  return GET(new NextRequest(`https://agiworkforce.com/r/${encodeURIComponent(code)}`), {
    params: Promise.resolve({ code }),
  });
}

afterEach(() => vi.unstubAllEnvs());

describe('GET /r/[code]', () => {
  it('sends a valid invite to the welcome page and remembers the code for 30 days', async () => {
    const response = await visit('ABCD2345');

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe(REFERRAL_WELCOME_PATH);
    const cookie = response.cookies.get(REFERRAL_ATTRIBUTION_COOKIE);
    expect(cookie).toMatchObject({
      value: 'ABCD2345',
      maxAge: REFERRAL_PROGRAM.attributionDays * 86_400,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
    expect(REFERRAL_PROGRAM.attributionDays).toBe(30);
  });

  it('reads a hand-typed code the way it was meant, in lower case with look-alike letters', async () => {
    const response = await visit('abcd-234o');

    expect(response.cookies.get(REFERRAL_ATTRIBUTION_COOKIE)?.value).toBe('ABCD2340');
  });

  it('marks the cookie secure in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const response = await visit('ABCD2345');

    expect(response.cookies.get(REFERRAL_ATTRIBUTION_COOKIE)?.secure).toBe(true);
  });

  it.each(['', 'SHORT', 'ABCD23456789', 'ABCD!345'])(
    'sends %j straight to sign-up without an attribution cookie',
    async (code) => {
      const response = await visit(code);

      expect(new URL(response.headers.get('location')!).pathname).toBe(AUTH_SIGNUP_PATH);
      expect(response.cookies.get(REFERRAL_ATTRIBUTION_COOKIE)).toBeUndefined();
    },
  );
});
