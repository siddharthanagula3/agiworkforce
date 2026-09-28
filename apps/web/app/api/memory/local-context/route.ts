import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { resolveLocalTurnPersonalContext } from '@/lib/services/turn-context-service';
import type { ManagedMemoryLocalContextResponse } from '@agiworkforce/types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleGetLocalContext(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const projectId = request.nextUrl.searchParams.get('projectId');
  if (projectId !== null && !UUID_PATTERN.test(projectId)) {
    throw createError.validation('projectId must be a UUID');
  }

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const body: ManagedMemoryLocalContextResponse = await resolveLocalTurnPersonalContext(db, {
    userId,
    organizationId,
    projectId,
  });

  return NextResponse.json(body);
}

export const GET = withCorsRoute(withErrorHandler(handleGetLocalContext));
export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 405 });
}
