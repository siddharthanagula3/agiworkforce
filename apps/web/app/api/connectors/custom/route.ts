import { NextRequest, NextResponse } from 'next/server';

import { requireCsrfToken } from '@/lib/csrf';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { evaluateConnectorPolicyForUser } from '@/lib/services/connector-policy-gate';
import { validateHttpsMcpUrl } from '@/lib/mcp-url-validation';
import { bearerCredential, sealCustomConnectorCredential } from '@/lib/custom-connector-crypto';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  evictCustomConnectorCaches,
  getUserCustomConnectorSummaries,
  type UserCustomConnectorSummary,
} from '@/lib/user-connector-tools';
import { findDirectoryTargetByRemoteUrl } from '@/lib/connectors/mcp-directory-targets';
import { mcpServerPublishesProtectedResource } from '@/lib/connectors/mcp-discovery';
import { disconnectConnectorOAuthGrant } from '@/lib/connectors/oauth-access';
import { resolveClientRedirectUri } from '@/lib/connectors/mcp-client-metadata';
import { getUserConnectorOAuthGrantSummaries } from '@/lib/connectors/oauth-store';
import {
  assertConnectorToolCapacity,
  assertCustomConnectorCapacity,
  clearConnectorToolPermissions,
  customConnectorId,
  deleteCustomConnectorRows,
  edgeBlockedMessage,
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
const OAUTH_CLIENT_ID_MAX_LENGTH = 512;
const OAUTH_CLIENT_SECRET_MAX_LENGTH = 4096;
const OAUTH_CLIENT_WITH_TOKEN_MESSAGE =
  'Use either an access token or OAuth client credentials for a custom connector, not both.';
const OAUTH_SECRET_WITHOUT_ID_MESSAGE = 'An OAuth client secret needs its OAuth client ID.';

async function withDirectoryLink(
  summary: UserCustomConnectorSummary,
  signedIn: ReadonlySet<string>,
): Promise<UserCustomConnectorSummary & { directoryId?: string; signedIn: boolean }> {
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
  return NextResponse.json({ connectors, ...(oauthRedirectUri ? { oauthRedirectUri } : {}) });
}

interface CreateBody {
  name?: string;
  url?: string;
  transport?: 'sse' | 'streamable-http';
  authToken?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
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
  });
  if (!policyDecision.allowed) throw createError.forbidden(policyDecision.reason);

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

  const hostDecision = await evaluateConnectorPolicyForUser({
    db,
    userId,
    connectorId: null,
    isCustom: true,
    url,
    request,
  });
  if (!hostDecision.allowed) throw createError.forbidden(hostDecision.reason);

  const authToken = typeof body.authToken === 'string' ? body.authToken.trim() : '';
  if (authToken.length > AUTH_TOKEN_MAX_LENGTH) {
    throw createError.validation('authToken is too long');
  }
  const credential = authToken ? bearerCredential(authToken) : null;

  const oauthClientId = typeof body.oauthClientId === 'string' ? body.oauthClientId.trim() : '';
  const oauthClientSecret =
    typeof body.oauthClientSecret === 'string' ? body.oauthClientSecret.trim() : '';
  if (
    oauthClientId.length > OAUTH_CLIENT_ID_MAX_LENGTH ||
    oauthClientSecret.length > OAUTH_CLIENT_SECRET_MAX_LENGTH
  ) {
    throw createError.validation('OAuth client credentials are too long');
  }
  if (oauthClientSecret && !oauthClientId) {
    throw createError.validation(OAUTH_SECRET_WITHOUT_ID_MESSAGE);
  }
  if (credential && oauthClientId) {
    throw createError.validation(OAUTH_CLIENT_WITH_TOKEN_MESSAGE);
  }

  let probe: McpProbeResult | null = null;
  try {
    probe = await probeMcpServer({
      serverName: name,
      url,
      transport,
      ...(credential ? { headers: { [credential.headerName]: credential.headerValue } } : {}),
      authorizationContext: `user:${userId}:custom-url:${url}`,
    });
  } catch (error) {
    if (!(error instanceof McpProbeError)) throw error;
    if (!error.authChallenge || credential) {
      throw createError.serviceUnavailable(
        error.edgeBlocked
          ? edgeBlockedMessage(name)
          : `Failed to connect to MCP server: ${error.message}`,
      );
    }
  }

  const signInRequired =
    !credential && (probe === null || (await mcpServerPublishesProtectedResource(url)));

  if (probe) assertConnectorToolCapacity(capacity.planTier, probe.toolCount);

  const saved = await insertCustomConnector(db, {
    userId,
    name,
    url,
    transport,
    credentialEnc: credential ? sealCustomConnectorCredential(credential) : null,
    connectorLimit: capacity.connectorLimit,
    signInRequired,
    oauthClient: oauthClientId
      ? { clientId: oauthClientId, clientSecret: oauthClientSecret || null }
      : null,
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
      signInRequired,
      oauthClientSupplied: oauthClientId.length > 0,
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
      signInRequired,
      ...(probe
        ? {
            toolCount: probe.toolCount,
            capabilityCounts: probe.capabilityCounts,
            protocolEra: probe.protocolEra,
          }
        : {}),
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
    await disconnectConnectorOAuthGrant(userId, customConnectorId(row.short_id));
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
