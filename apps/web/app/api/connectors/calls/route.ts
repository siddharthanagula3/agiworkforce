import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { readConnectorCallLog } from '@/lib/services/connector-call-log-service';

export const runtime = 'nodejs';

const CONNECTOR_SCOPE = { resolveOrganization: false } as const;
const RATE_LIMIT_BUCKET = 'chat-conversation';
const DEFAULT_LIMIT = 50;

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);
  const requested = request.nextUrl.searchParams.get('connectorId');
  const limit = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '', 10);

  const calls = await readConnectorCallLog(db, userId, {
    connectorId: requested,
    limit: Number.isFinite(limit) ? limit : DEFAULT_LIMIT,
  });

  return NextResponse.json({ calls });
}

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
