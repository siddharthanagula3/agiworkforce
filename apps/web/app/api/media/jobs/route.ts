import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { listMediaJobHistory } from '@/lib/server/media-job-history';
import { getUserScopedDb } from '@/lib/server/rls-db';

export const runtime = 'nodejs';

const RATE_LIMIT_BUCKET = 'chat-conversation';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const limited = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (limited) return limited;

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const jobs = await listMediaJobHistory(db, userId, organizationId);
  return NextResponse.json({ jobs }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
