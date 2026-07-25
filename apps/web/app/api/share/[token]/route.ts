/**
 * Share Token API
 *
 * GET  /api/share/[token] - fetch a shared session (public, rate-limited)
 * DELETE /api/share/[token] - revoke a shared session (owner only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';

const TOKEN_REGEX = /^[A-Za-z0-9_-]{24}$/;

type RouteContext = { params: Promise<{ token: string }> };

type SharedSessionRow = {
  id: string;
  token: string;
  title: string;
  model_id: string | null;
  provider: string | null;
  messages: unknown;
  total_messages: number;
  expires_at: string;
  created_at: string;
};

async function handleGetShare(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;

  if (!TOKEN_REGEX.test(token)) {
    throw createError.notFound('Invalid token');
  }

  const rateLimitResponse = await withRateLimit(request, 'share-view');
  if (rateLimitResponse) return rateLimitResponse;

  const db = getNeonDb();

  // GOV-28: do NOT fold expiry into the WHERE clause. Doing so made "no such
  // share" and "this share expired" indistinguishable, and the API's own 404
  // message ("not found or expired") admitted the conflation — while
  // app/share/[token]/page.tsx queried WITHOUT the expiry filter and rendered a
  // dedicated expired banner. Two paths, two different answers for the same
  // URL. Both now select the row first and judge expiry second.
  const [data] = await db.query<SharedSessionRow>(
    `select id, token, title, model_id, provider, messages, total_messages, expires_at, created_at
     from shared_sessions
     where token = $1
     limit 1`,
    [token],
  );

  if (!data) {
    throw createError.notFound('Shared session not found');
  }

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    // 410 Gone: the resource existed and is deliberately no longer served.
    // Only the expiry timestamp is disclosed — never the conversation body.
    return NextResponse.json(
      {
        error: {
          code: 'SHARE_EXPIRED',
          message: 'This shared conversation has expired.',
          expires_at: data.expires_at,
        },
      },
      { status: 410 },
    );
  }

  return NextResponse.json(data);
}

async function handleDeleteShare(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;

  if (!TOKEN_REGEX.test(token)) {
    throw createError.notFound('Invalid token');
  }

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  let userId: string;
  try {
    const authResult = await getClerkAuthUser(request);
    userId = authResult.userId;
  } catch {
    throw createError.unauthorized();
  }

  const db = getNeonDb();

  try {
    await db.execute('delete from shared_sessions where token = $1 and owner_id = $2', [
      token,
      userId,
    ]);
  } catch (err) {
    logger.error({ err, token, userId }, 'Failed to revoke shared session');
    throw createError.internal('Failed to revoke share');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetShare);
export const DELETE = withErrorHandler(handleDeleteShare);
