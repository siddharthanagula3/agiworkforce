import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  PUBLISHED_TOKEN_REGEX,
  unpublishArtifactRecord,
} from '@/lib/services/published-artifact-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ token: string }> };

async function handleUnpublish(request: NextRequest, context: RouteContext): Promise<Response> {
  const { token } = await context.params;

  if (!PUBLISHED_TOKEN_REGEX.test(token)) {
    throw createError.notFound('Published artifact not found');
  }

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'share-create');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const deleted = await unpublishArtifactRecord(db, { userId, token });

  if (!deleted) {
    throw createError.notFound('Published artifact not found');
  }

  return NextResponse.json({ success: true, token });
}

export const DELETE = withErrorHandler(handleUnpublish);
