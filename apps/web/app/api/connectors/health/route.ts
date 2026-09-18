import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { readConnectorHealth } from '@/lib/connectors/health';

export const runtime = 'nodejs';

const CONNECTOR_SCOPE = { resolveOrganization: false } as const;
const RATE_LIMIT_BUCKET = 'chat-conversation';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);
  const connectors = await readConnectorHealth(db, userId);
  const requested = request.nextUrl.searchParams.get('connectorId');

  return NextResponse.json({
    connectors: requested
      ? connectors.filter((entry) => entry.connectorId === requested)
      : connectors,
  });
}

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
