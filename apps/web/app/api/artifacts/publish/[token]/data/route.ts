import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type {
  ManagedCloudPublishedArtifactDataClearResponse,
  ManagedCloudPublishedArtifactDataResponse,
} from '@agiworkforce/cloud-contracts';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { PUBLISHED_TOKEN_REGEX } from '@/lib/services/published-artifact-service';
import {
  clearOwnedSiteSharedData,
  readOwnedSiteData,
} from '@/lib/services/published-site-data-service';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

type RouteContext = { params: Promise<{ token: string }> };

async function handleRead(request: NextRequest, context: RouteContext): Promise<Response> {
  const { token } = await context.params;
  if (!PUBLISHED_TOKEN_REGEX.test(token)) {
    throw createError.notFound('Published artifact not found');
  }

  const rateLimitResponse = await withRateLimit(request, 'share-view');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const data = await readOwnedSiteData(db, { userId, token });
  if (!data) throw createError.notFound('Published artifact not found');

  const body: ManagedCloudPublishedArtifactDataResponse = data;
  return NextResponse.json(body, { headers: NO_STORE });
}

async function handleClear(request: NextRequest, context: RouteContext): Promise<Response> {
  const { token } = await context.params;
  if (!PUBLISHED_TOKEN_REGEX.test(token)) {
    throw createError.notFound('Published artifact not found');
  }

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'share-create');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const cleared = await clearOwnedSiteSharedData(db, { userId, token });
  if (cleared === null) throw createError.notFound('Published artifact not found');

  const body: ManagedCloudPublishedArtifactDataClearResponse = { cleared };
  return NextResponse.json(body, { headers: NO_STORE });
}

export const GET = withErrorHandler(handleRead);
export const DELETE = withErrorHandler(handleClear);
