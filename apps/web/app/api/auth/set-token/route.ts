import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireCsrfToken } from '@/lib/csrf';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

export async function POST(request: Request) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  try {
    const body = (await request.json()) as { token?: string; refreshToken?: string };
    const cookieStore = await cookies();

    if (body.token) {
      cookieStore.set('agi_access_token', body.token, COOKIE_OPTS);
    }
    if (body.refreshToken) {
      cookieStore.set('agi_refresh_token', body.refreshToken, {
        ...COOKIE_OPTS,
        maxAge: 60 * 60 * 24 * 30, // 30 days for refresh token
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }
}
