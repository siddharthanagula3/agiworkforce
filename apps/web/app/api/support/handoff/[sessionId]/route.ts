
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import {
  cancelHandoffForOwner,
  getHandoffStatusForOwner,
} from '@/lib/support/handoff/handoff-service';
import { resolveHandoffIdentity } from '@/lib/support/handoff/request-identity';

type RouteContext = { params: Promise<{ sessionId: string }> };

async function handleStatus(request: NextRequest, context: RouteContext) {
  const limited = await withRateLimit(request, 'support-handoff-status');
  if (limited) return limited;

  const { sessionId } = await context.params;
  const identity = await resolveHandoffIdentity(request);

  const status = await getHandoffStatusForOwner(sessionId, identity.ownerSessionKey);
  if (!status) {
    throw createError.notFound('Support request not found');
  }

  return NextResponse.json(status, { headers: { 'cache-control': 'no-store' } });
}

async function handleCancel(request: NextRequest, context: RouteContext) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-handoff-status');
  if (limited) return limited;

  const { sessionId } = await context.params;
  const identity = await resolveHandoffIdentity(request);

  const status = await cancelHandoffForOwner(sessionId, identity.ownerSessionKey);
  if (!status) {
    throw createError.notFound('Support request not found');
  }
  return NextResponse.json(status);
}

export const GET = withErrorHandler(handleStatus);
export const DELETE = withErrorHandler(handleCancel);
