import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { ManagedCloudPublishedArtifactVersionDetail } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  PUBLISHED_TOKEN_REGEX,
  readPublishedArtifactVersion,
} from '@/lib/services/published-artifact-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ token: string; version: string }> };

async function handleReadVersion(request: NextRequest, context: RouteContext): Promise<Response> {
  const { token, version } = await context.params;
  const number = Number(version);
  if (!PUBLISHED_TOKEN_REGEX.test(token) || !Number.isInteger(number) || number < 1) {
    throw createError.notFound('Published version not found');
  }

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const detail = await readPublishedArtifactVersion(db, { userId, token, version: number });
  if (!detail) throw createError.notFound('Published version not found');

  const body: ManagedCloudPublishedArtifactVersionDetail = detail;
  return NextResponse.json(body);
}

export const GET = withErrorHandler(handleReadVersion);
