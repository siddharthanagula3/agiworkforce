import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { decodeKeysetCursor, isTimestampUuidCursor } from '@/lib/identity/pagination';
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
  cursor: z.string().trim().min(1).max(512).optional(),
});

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    requestId: url.searchParams.get('requestId') ?? undefined,
    conversationId: url.searchParams.get('conversationId') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    cursor: url.searchParams.get('cursor') ?? undefined,
  });
  if (!parsed.success) {
    throw createError.badRequest('Invalid research report query', parsed.error.flatten());
  }

  const cursor = parsed.data.cursor ? decodeKeysetCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor && (!cursor || !isTimestampUuidCursor(cursor))) {
    throw createError.badRequest('Invalid research report cursor');
  }

  const { db, userId, organizationId } = await getUserScopedDb(request);

  if (parsed.data.requestId) {
    const report = await getResearchReportByRequestId(db, {
      userId,
      requestId: parsed.data.requestId,
    });
    if (!report) throw createError.notFound('Research report not found');
    return NextResponse.json({ report });
  }

  const page = await listResearchReports(db, {
    userId,
    organizationId,
    conversationId: parsed.data.conversationId ?? null,
    ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
    cursor,
  });
  return NextResponse.json({ reports: page.reports, nextCursor: page.nextCursor });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
