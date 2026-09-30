import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { type HealthSpaceResponse } from '@agiworkforce/cloud-contracts';
import { assertAccountActive } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ensureHealthSpace,
  findHealthSpaceId,
  healthSpaceUnavailableReason,
} from '@/lib/services/health-space-service';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

async function handleGet(request: NextRequest): Promise<Response> {
  const scoped = await getUserScopedDb(request);
  await assertAccountActive(scoped.userId, request);
  const limited = await withRateLimit(request, 'health-space', `user:${scoped.userId}`);
  if (limited) return limited;

  const reason = healthSpaceUnavailableReason({
    request,
    organizationId: scoped.organizationId,
  });
  const body: HealthSpaceResponse = reason
    ? { status: 'unavailable', reason }
    : { status: 'available', projectId: await findHealthSpaceId(scoped.db, scoped.userId) };
  return NextResponse.json(body, { headers: NO_STORE });
}

async function handlePost(request: NextRequest): Promise<Response> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const scoped = await getUserScopedDb(request);
  await assertAccountActive(scoped.userId, request);
  const limited = await withRateLimit(request, 'health-space', `user:${scoped.userId}`);
  if (limited) return limited;

  const reason = healthSpaceUnavailableReason({
    request,
    organizationId: scoped.organizationId,
  });
  if (reason === 'not_configured') {
    throw createError.capabilityUnavailable('Health is not available yet.');
  }
  if (reason === 'region') {
    throw createError.forbidden('Health is available in the United States only.');
  }
  if (reason === 'workspace') {
    throw createError.forbidden(
      'Health is part of your personal account. Switch to it to use Health.',
    );
  }

  const projectId = await ensureHealthSpace(scoped.db, scoped.userId);
  const body: HealthSpaceResponse = { status: 'available', projectId };
  return NextResponse.json(body, { headers: NO_STORE });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
