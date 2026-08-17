import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';

import { shareRef } from '@/lib/share-ref';

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

  let deleted: number;
  try {
    deleted = await db.execute('delete from shared_sessions where token = $1 and owner_id = $2', [
      token,
      userId,
    ]);
  } catch (err) {
    logger.error({ err, share: shareRef(token), userId }, 'Failed to revoke shared session');
    throw createError.internal('Failed to revoke share');
  }

  // A caller who merely holds the link must not be told the revocation worked.
  if (deleted === 0) {
    throw createError.notFound('Shared session not found');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetShare);
export const DELETE = withErrorHandler(handleDeleteShare);
