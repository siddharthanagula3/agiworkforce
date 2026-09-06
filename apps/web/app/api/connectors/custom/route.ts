import { NextRequest, NextResponse } from 'next/server';

import { requireCsrfToken } from '@/lib/csrf';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { validateHttpsMcpUrl } from '@/lib/mcp-url-validation';
import { bearerCredential, sealCustomConnectorCredential } from '@/lib/custom-connector-crypto';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  evictCustomConnectorCaches,
  getUserCustomConnectorSummaries,
} from '@/lib/user-connector-tools';
import {
  assertConnectorToolCapacity,
  assertCustomConnectorCapacity,
  clearConnectorToolPermissions,
  customConnectorId,
  deleteCustomConnectorRows,
  insertCustomConnector,
  McpProbeError,
  probeMcpServer,
  toCustomConnectorView,
  transportForUrl,
  type McpProbeResult,
} from '@/lib/connectors/mcp-custom-connections';

export const runtime = 'nodejs';

const CONNECTOR_SCOPE = { resolveOrganization: false } as const;
const RATE_LIMIT_BUCKET = 'chat-conversation';
const NAME_MAX_LENGTH = 200;
const AUTH_TOKEN_MAX_LENGTH = 4096;
const AUDIT_RESOURCE_TYPE = 'custom_mcp_connector';
const AUDIT_SOURCE = 'custom_mcp';

async function handleGet(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);

  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET, `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const connectors = await getUserCustomConnectorSummaries(db, userId);

  return NextResponse.json({ connectors });
}

interface CreateBody {
  name?: string;
  url?: string;
  transport?: 'sse' | 'streamable-http';
  authToken?: string;
}

async function handlePost(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET, `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    throw createError.validation('Invalid JSON body');
  }

  const name = body.name?.trim();
  if (!name || name.length > NAME_MAX_LENGTH) {
    throw createError.validation(`name is required (1 to ${NAME_MAX_LENGTH} chars)`);
  }

  const capacity = await assertCustomConnectorCapacity(db, userId);

  const parsedUrl = await validateHttpsMcpUrl(body.url);
  const url = parsedUrl.toString();
  const transport = transportForUrl(parsedUrl, body.transport);

  const authToken = typeof body.authToken === 'string' ? body.authToken.trim() : '';
  if (authToken.length > AUTH_TOKEN_MAX_LENGTH) {
    throw createError.validation('authToken is too long');
  }
  const credential = authToken ? bearerCredential(authToken) : null;

  let probe: McpProbeResult;
  try {
    probe = await probeMcpServer({
      serverName: name,
      url,
      transport,
      ...(credential ? { headers: { [credential.headerName]: credential.headerValue } } : {}),
      authorizationContext: `user:${userId}:custom-url:${url}`,
    });
  } catch (error) {
    if (error instanceof McpProbeError) {
      throw createError.serviceUnavailable(`Failed to connect to MCP server: ${error.message}`);
    }
    throw error;
  }

  assertConnectorToolCapacity(capacity.planTier, probe.toolCount);

  const saved = await insertCustomConnector(db, {
    userId,
    name,
    url,
    transport,
    credentialEnc: credential ? sealCustomConnectorCredential(credential) : null,
    connectorLimit: capacity.connectorLimit,
  });

  await recordAuditEvent({
    userId,
    eventType: 'connector_added',
    request,
    detail: {
      resourceType: AUDIT_RESOURCE_TYPE,
      resourceId: saved.id,
      resourceName: saved.name,
      connectorId: customConnectorId(saved.short_id),
      transport: saved.transport,
      source: AUDIT_SOURCE,
    },
  });

  const view = toCustomConnectorView(saved);
  return NextResponse.json(
    {
      connector: {
        id: view.id,
        shortId: view.shortId,
        name: view.name,
        url: view.url,
        transport: view.transport,
        createdAt: view.createdAt,
        updatedAt: view.updatedAt,
      },
      toolCount: probe.toolCount,
      capabilityCounts: probe.capabilityCounts,
      protocolEra: probe.protocolEra,
    },
    { status: 201 },
  );
}

async function handleDelete(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET, `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    throw createError.validation('id query param is required');
  }

  const deleted = await deleteCustomConnectorRows(db, userId, id);

  for (const row of deleted) {
    await evictCustomConnectorCaches(userId, row.id);
    await clearConnectorToolPermissions(db, userId, customConnectorId(row.short_id));
    await recordAuditEvent({
      userId,
      eventType: 'connector_removed',
      request,
      detail: {
        resourceType: AUDIT_RESOURCE_TYPE,
        resourceId: row.id,
        connectorId: customConnectorId(row.short_id),
        source: AUDIT_SOURCE,
      },
    });
  }

  return NextResponse.json({ success: true });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handlePost));
export const DELETE = withCorsRoute(withErrorHandler(handleDelete));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
