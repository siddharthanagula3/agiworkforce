import { NextRequest, NextResponse } from 'next/server';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import type {
  CreateCustomConnectorRequest,
  CreateCustomConnectorResponse,
  CustomConnectorSummary,
  DeleteCustomConnectorResponse,
  ListCustomConnectorsResponse,
} from '@agiworkforce/cloud-contracts';

import { requireCsrfToken } from '@/lib/csrf';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { logger } from '@/lib/logger';
import { recordExternalResourceReferences } from '@/lib/server/external-resource-references';
import { evaluateConnectorPolicyForUser } from '@/lib/services/connector-policy-gate';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  evictCustomConnectorCaches,
  getUserCustomConnectorSummaries,
  type UserCustomConnectorSummary,
} from '@/lib/user-connector-tools';
import { findDirectoryTargetByRemoteUrl } from '@/lib/connectors/mcp-directory-targets';
import { createCustomConnector } from '@/lib/connectors/custom-connector-creation';
import {
  disconnectConnectorOAuthGrant,
  vendorRevocationAuditStatus,
  vendorRevocationNotice,
} from '@/lib/connectors/oauth-access';
import { resolveClientRedirectUri } from '@/lib/connectors/mcp-client-metadata';
import { getUserConnectorOAuthGrantSummaries } from '@/lib/connectors/oauth-store';
import {
  clearConnectorToolPermissions,
  customConnectorId,
  deleteCustomConnectorRows,
  findCustomConnectorRow,
  toCustomConnectorView,
} from '@/lib/connectors/mcp-custom-connections';

export const runtime = 'nodejs';

const CONNECTOR_SCOPE = { resolveOrganization: false } as const;
const RATE_LIMIT_BUCKET = 'chat-conversation';
const AUDIT_RESOURCE_TYPE = 'custom_mcp_connector';
const AUDIT_SOURCE = 'custom_mcp';

async function withDirectoryLink(
  summary: UserCustomConnectorSummary,
  signedIn: ReadonlySet<string>,
): Promise<CustomConnectorSummary> {
  const linked = await findDirectoryTargetByRemoteUrl(summary.url);
  const signIn = { ...summary, signedIn: signedIn.has(customConnectorId(summary.shortId)) };
  return linked ? { ...signIn, directoryId: linked.connectorId } : signIn;
}

async function handleGet(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);

  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET, `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const summaries = await getUserCustomConnectorSummaries(db, userId);
  const signedIn = new Set(
    (await getUserConnectorOAuthGrantSummaries(userId))
      .filter((grant) => !grant.needsReauthorization)
      .map((grant) => grant.connectorId),
  );
  const connectors = await Promise.all(
    summaries.map((summary) => withDirectoryLink(summary, signedIn)),
  );

  const oauthRedirectUri = resolveClientRedirectUri();
  return NextResponse.json({
    connectors,
    ...(oauthRedirectUri ? { oauthRedirectUri } : {}),
  } satisfies ListCustomConnectorsResponse);
}

async function handlePost(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET, `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  // A custom connector is an arbitrary member-supplied MCP endpoint, and
  // `allowCustomConnectors` is the switch an administrator sets to say no to
  // exactly that. It was consulted only when tools were read, so the endpoint
  // was created, probed and stored first and hidden afterwards. Refused before
  // the body is parsed, so nothing is reached and nothing is written.
  // organizationId is omitted, not passed: this route reads the database on a
  // deliberately null-org scope, and the gate reads an explicit null as
  // "personal account, skip policy" before its own workspace lookup runs.
  const policyDecision = await evaluateConnectorPolicyForUser({
    db,
    userId,
    connectorId: null,
    isCustom: true,
    request,
    surface: resolveCloudChatSurface(request),
  });
  if (!policyDecision.allowed) throw createError.forbidden(policyDecision.reason).asUserSafe();

  let body: Partial<CreateCustomConnectorRequest>;
  try {
    body = (await request.json()) as Partial<CreateCustomConnectorRequest>;
  } catch {
    throw createError.validation('Invalid JSON body');
  }

  const {
    connector: saved,
    signInRequired,
    probe,
  } = await createCustomConnector(db, {
    userId,
    request,
    name: body.name,
    url: body.url,
    transport: body.transport,
    authToken: body.authToken,
    oauthClientId: body.oauthClientId,
    oauthClientSecret: body.oauthClientSecret,
  });

  await recordExternalResourceReferences(db, { userId, organizationId: null }, [
    {
      kind: 'mcp_server',
      provider: 'custom',
      uri: saved.url,
      title: saved.name,
      access: 'connector',
      connectorId: customConnectorId(saved.short_id),
    },
  ]).catch((error: unknown) => {
    logger.warn(
      { error, userId, connectorId: customConnectorId(saved.short_id) },
      '[connectors] the custom connector server was not recorded',
    );
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
      signInRequired,
      ...(probe
        ? {
            toolCount: probe.toolCount,
            capabilityCounts: probe.capabilityCounts,
            protocolEra: probe.protocolEra,
          }
        : {}),
    } satisfies CreateCustomConnectorResponse,
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

  const existing = await findCustomConnectorRow(db, userId, id);
  const disconnect = existing
    ? await disconnectConnectorOAuthGrant(userId, customConnectorId(existing.short_id))
    : null;
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
        ...(disconnect ? { status: vendorRevocationAuditStatus(disconnect.vendorRevocation) } : {}),
      },
    });
  }

  const vendorNotice =
    existing && disconnect
      ? vendorRevocationNotice(existing.name, disconnect.vendorRevocation)
      : null;
  return NextResponse.json({
    success: true,
    ...(vendorNotice ? { vendorNotice } : {}),
  } satisfies DeleteCustomConnectorResponse);
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handlePost));
export const DELETE = withCorsRoute(withErrorHandler(handleDelete));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
