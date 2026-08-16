import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  getResearchReportByRequestId,
  listResearchReports,
} from '@/lib/services/research-report-service';

export const runtime = 'nodejs';

const QuerySchema = z.object({
  requestId: z.string().trim().min(1).max(128).optional(),
  conversationId: z.string().trim().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    requestId: url.searchParams.get('requestId') ?? undefined,
    conversationId: url.searchParams.get('conversationId') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    throw createError.badRequest('Invalid research report query', parsed.error.flatten());
  }

  const { db, userId } = await getUserScopedDb(request);

  if (parsed.data.requestId) {
    const report = await getResearchReportByRequestId(db, {
      userId,
      requestId: parsed.data.requestId,
    });
    if (!report) throw createError.notFound('Research report not found');
    return NextResponse.json({ report });
  }

  const reports = await listResearchReports(db, {
    userId,
    conversationId: parsed.data.conversationId ?? null,
    ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
  });
  return NextResponse.json({ reports });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
