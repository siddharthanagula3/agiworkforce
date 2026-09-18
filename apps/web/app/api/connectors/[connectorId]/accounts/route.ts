import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  connectorSupportsMultipleAccounts,
  connectorSupportsServiceAccount,
} from '@/lib/connectors/catalog';
import { sortConnectorAccounts } from '@/lib/connectors/accounts';
import {
  listConnectorAccounts,
  revokeConnectorOAuthGrant,
  setDefaultConnectorAccount,
} from '@/lib/connectors/oauth-store';
import { evictConnectorOAuthCaches } from '@/lib/user-connector-tools';

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

  return NextResponse.json({
    connectorId,
    accounts: sortConnectorAccounts(accounts),
    supportsMultipleAccounts: connectorSupportsMultipleAccounts(connectorId),
    supportsServiceAccount: connectorSupportsServiceAccount(connectorId),
  });
}

async function handlePatch(request: NextRequest, context: Params): Promise<NextResponse> {
  const connectorId = await readConnectorId(context);
  const { userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (rateLimitResponse) return rateLimitResponse;

  let body: { accountKey?: string };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }
  const accountKey = body.accountKey?.trim();
  if (!accountKey) throw createError.validation('accountKey is required');

  const changed = await setDefaultConnectorAccount(userId, connectorId, accountKey);
  if (!changed) {
    throw createError.notFound(
      `No connected account "${accountKey}" for ${connectorId}, so nothing was changed.`,
    );
  }
  await evictConnectorOAuthCaches(userId, connectorId);

  return NextResponse.json({ connectorId, accountKey, isDefault: true });
}

async function handleDelete(request: NextRequest, context: Params): Promise<NextResponse> {
  const connectorId = await readConnectorId(context);
  const { userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (rateLimitResponse) return rateLimitResponse;

  const accountKey = request.nextUrl.searchParams.get('accountKey')?.trim();
  if (!accountKey) throw createError.validation('accountKey is required');

  const revoked = await revokeConnectorOAuthGrant(userId, connectorId, accountKey);
  if (!revoked) {
    throw createError.notFound(
      `No connected account "${accountKey}" for ${connectorId}, so nothing was disconnected.`,
    );
  }
  await evictConnectorOAuthCaches(userId, connectorId);
  await recordAuditEvent({
    userId,
    eventType: 'connector_removed',
    request,
    detail: { resourceType: 'connector', connectorId, resourceId: accountKey, source: 'account' },
  });

  return NextResponse.json({ success: true, connectorId, accountKey });
}

export const GET = withErrorHandler(handleGet);
export const PATCH = withErrorHandler(handlePatch);
export const DELETE = withErrorHandler(handleDelete);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
