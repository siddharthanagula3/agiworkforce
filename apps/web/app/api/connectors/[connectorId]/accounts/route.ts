import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { listConnectorAccounts } from '@/lib/connectors/oauth-store';

export const runtime = 'nodejs';

const CONNECTOR_SCOPE = { resolveOrganization: false } as const;
const RATE_LIMIT_BUCKET = 'chat-conversation';

type Params = { params: Promise<{ connectorId: string }> };

const CONNECTOR_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

async function readConnectorId(context: Params): Promise<string> {
  const { connectorId } = await context.params;
  if (!CONNECTOR_REF_RE.test(connectorId ?? '')) {
    throw createError.validation('Invalid connector identifier');
  }
  return connectorId;
}

async function handleGet(request: NextRequest, context: Params): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (rateLimitResponse) return rateLimitResponse;

  const connectorId = await readConnectorId(context);
  const { userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);
  const accounts = await listConnectorAccounts(userId, connectorId);

  return NextResponse.json({ connectorId, accounts });
}

export const GET = withErrorHandler(handleGet);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
