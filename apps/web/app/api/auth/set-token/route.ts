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

// JWTs are typically 200-2000 chars; refresh tokens similar. 4 KB is a generous cap that rejects junk.
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

  // Validate the access token is a real Clerk JWT before writing it as a session cookie.
  // This blocks forged-auth-cookie attacks that could arise from a valid CSRF token + this
  // endpoint being reached with an attacker-supplied JWT.
  // Only ever set from a signature-VERIFIED claim (never from a decoded
  // payload) so the audit row cannot be attributed to a forged subject.
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

  // Clerk handles token rotation internally; a standalone refreshToken without
  // an access token is not a supported pattern. If only a refreshToken is
  // provided, reject rather than silently storing an unvalidated cookie.
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

  // Audit: successful sign-in. Only the verified subject and the transport are
  // recorded — the raw Clerk JWT in `parsed.token` must never reach a log row.
  // recordAuditEvent never throws, so a failed write cannot fail the sign-in.
  await recordAuditEvent({
    userId: verifiedUserId,
    eventType: 'login',
    request,
    detail: { source: 'session_cookie', resourceType: 'session' },
  });

  return NextResponse.json({ ok: true });
}
