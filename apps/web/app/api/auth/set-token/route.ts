import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

const TOKEN_MAX_BYTES = 4096;

const BodySchema = z.object({
  token: z.string().min(20).max(TOKEN_MAX_BYTES).optional(),
  refreshToken: z.string().min(20).max(TOKEN_MAX_BYTES).optional(),
});

export async function POST(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'auth-login');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  let parsed: z.infer<typeof BodySchema>;
  try {
    const raw = await request.json();
    parsed = BodySchema.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  if (!parsed.token && !parsed.refreshToken) {
    return NextResponse.json({ ok: false, error: 'No token provided' }, { status: 400 });
  }

  let verifiedUserId: string | null = null;

  if (parsed.token) {
    try {
      const { verifyToken } = await import('@clerk/backend');
      const secretKey = process.env['CLERK_SECRET_KEY'];
      if (!secretKey) {
        logger.error({}, 'CLERK_SECRET_KEY not configured');
        return NextResponse.json(
          { ok: false, error: 'Server configuration error' },
          { status: 500 },
        );
      }
      const claims = await verifyToken(parsed.token, { secretKey });
      if (!claims.sub) {
        return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 });
      }
      verifiedUserId = claims.sub;
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid token' }, { status: 401 });
    }
  }

  if (parsed.refreshToken && !parsed.token) {
    return NextResponse.json(
      { ok: false, error: 'refreshToken alone is not accepted; provide the access token' },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  if (parsed.token) {
    cookieStore.set('agi_access_token', parsed.token, COOKIE_OPTS);
  }
  if (parsed.refreshToken) {
    cookieStore.set('agi_refresh_token', parsed.refreshToken, {
      ...COOKIE_OPTS,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }

  await recordAuditEvent({
    userId: verifiedUserId,
    eventType: 'login',
    request,
    detail: { source: 'session_cookie', resourceType: 'session' },
  });

  return NextResponse.json({ ok: true });
}
