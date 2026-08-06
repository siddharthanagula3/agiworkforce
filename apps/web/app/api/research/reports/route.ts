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

/**
 * Durable Deep Research reports (CAP-045 slice 1/3 read path).
 *
 *   GET /api/research/reports                       - newest reports for the caller
 *   GET /api/research/reports?conversationId=<uuid> - reports for one conversation
 *   GET /api/research/reports?requestId=<key>       - the report for one run
 *
 * Read-only: reports are written by the research loop during the chat request
 * that produced them, never by a client. Every query runs through
 * `getUserScopedDb`, so migration 0094's owner-only policies enforce isolation
 * in the DATABASE, not merely in the service's WHERE clause.
 */

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
    // A report the caller does not own is indistinguishable from one that does
    // not exist — the RLS read simply returns nothing.
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
