import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { ManagedCloudPublishedArtifactVersionListResponse } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  PUBLISHED_TOKEN_REGEX,
  listPublishedArtifactVersions,
} from '@/lib/services/published-artifact-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ token: string }> };

async function handleListVersions(request: NextRequest, context: RouteContext): Promise<Response> {
  const { token } = await context.params;
  if (!PUBLISHED_TOKEN_REGEX.test(token)) {
    throw createError.notFound('Published artifact not found');
  }

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const versions = await listPublishedArtifactVersions(db, { userId, token });
  if (!versions) throw createError.notFound('Published artifact not found');

  const body: ManagedCloudPublishedArtifactVersionListResponse = { versions };
  return NextResponse.json(body);
}

export const GET = withErrorHandler(handleListVersions);
