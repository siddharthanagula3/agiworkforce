import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { withdrawSubmission } from '@/lib/services/plugin-submission-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });

type RouteContext = { params: Promise<{ id: string }> };

async function handleDelete(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success || !(await withdrawSubmission(db, userId, params.data.id))) {
    throw createError
      .notFound('That submission is not yours, or it is no longer in review or listed.')
      .asUserSafe();
  }
  await recordAuditEvent({
    userId,
    organizationId,
    eventType: 'plugin_marketplace_changed',
    request,
    detail: {
      resourceType: 'plugin_submission',
      resourceId: params.data.id,
      status: 'withdrawn',
    },
  });
  return new NextResponse(null, { status: 204 });
}

export const DELETE = withCorsRoute(withErrorHandler(handleDelete));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
