import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { CloudCodeSharedSessionReply } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { rethrowCloudCodeError } from '@/lib/services/cloud-code-session-errors';
import {
  CloudCodeSharedRepositoryError,
  openSharedCloudCodeSession,
} from '@/lib/services/cloud-code-session-sharing';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ token: string }> };

async function handleGet(request: NextRequest, context: RouteContext) {
  const { db, userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'share-view', `user:${userId}`);
  if (limited) return limited;
  const { token } = await context.params;
  try {
    const shared = await openSharedCloudCodeSession(db, userId, token);
    if (!shared) {
      throw createError.notFound(
        'This shared session is not available. Its owner may have stopped sharing it.',
      );
    }
    const reply: CloudCodeSharedSessionReply = shared;
    return NextResponse.json(reply);
  } catch (error) {
    if (error instanceof CloudCodeSharedRepositoryError) throw createError.forbidden(error.message);
    rethrowCloudCodeError(error);
  }
}

export const GET = withErrorHandler(handleGet);
