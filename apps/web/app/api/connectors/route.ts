import { NextRequest, NextResponse } from 'next/server';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  evictConnectorOAuthCaches,
  getOperatorMappedConnectorIds,
  getUserGithubInstallations,
  getUserCustomConnectorSummaries,
} from '@/lib/user-connector-tools';
import {
  getGitHubAppInstallUrl,
  isGitHubAppConfigured,
  isGitHubInstallationLinkingAvailable,
} from '@/lib/github-app';
import {
  buildConnectorOAuthStartPath,
  getOAuthConfiguredConnectorIds,
  isConnectorOAuthConfigured,
  isConnectorOAuthSupported,
} from '@/lib/connectors/oauth-registry';
import {
  connectorIdsWithMcpEndpoint,
  isSelfServiceConnector,
} from '@/lib/connectors/mcp-endpoints';
import {
  isDeviceLocalConnector,
  isKnownConnectorId,
  resolveConnectorHealth,
  type ConnectorHealth,
} from '@/lib/connectors/catalog';
import { getUserConnectorOAuthGrantSummaries } from '@/lib/connectors/oauth-store';
import { disconnectConnectorOAuthGrant } from '@/lib/connectors/oauth-access';
import {
  CONNECTOR_TOKEN_STORAGE_UNAVAILABLE,
  isConnectorTokenStorageAvailable,
} from '@/lib/custom-connector-crypto';

const GITHUB_CONNECTOR_ID = 'github';

const CONNECTOR_SCOPE = { resolveOrganization: false } as const;

type ScopedDb = Awaited<ReturnType<typeof getUserScopedDb>>['db'];

async function clearConnectorToolPermissions(
  db: ScopedDb,
  userId: string,
  connectorId: string,
): Promise<void> {
  try {
    await db.execute(
      `delete from public.connector_tool_permissions where user_id = $1 and connector_id = $2`,
      [userId, connectorId],
    );
  } catch (error) {
    if (isUndefinedTable(error)) return;
    logger.warn(
      { userId, connectorId, error },
      'Connector tool permissions could not be cleared on disconnect; a later reconnect may reuse them',
    );
  }
}

type UserConnectorRow = {
  id: string;
  connector_id: string;
  auth_type: string;
  connected_at: string;
  updated_at: string;
};

const PG_UNDEFINED_TABLE = '42P01';

function isUndefinedTable(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    ((error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE ||
      String((error as Record<string, unknown>)['message'] ?? '').includes('does not exist'))
  );
}

function getAvailableConnectorIds(): string[] {
  const available = new Set<string>();
  for (const id of getOperatorMappedConnectorIds()) available.add(id);
  for (const id of getOAuthConfiguredConnectorIds()) available.add(id);
  for (const id of connectorIdsWithMcpEndpoint()) {
    if (isSelfServiceConnector(id)) available.add(id);
  }
  if (
    isGitHubInstallationLinkingAvailable() &&
    isGitHubAppConfigured() &&
    getGitHubAppInstallUrl()
  ) {
    available.add(GITHUB_CONNECTOR_ID);
  }
  return [...available];
}

async function handleGetConnectors(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);

  let rows: UserConnectorRow[];
  try {
    rows = await db.query<UserConnectorRow>(
      `select id, connector_id, auth_type, connected_at, updated_at
       from user_connectors
       where user_id = $1 and is_active = true
       order by connected_at desc`,
      [userId],
    );
  } catch (error) {
    if (isUndefinedTable(error)) {
      logger.warn({ userId }, 'user_connectors table not migrated; returning empty connectors');
      rows = [];
    } else {
      throw error;
    }
  }

  type ConnectorEntry = {
    id: string;
    connectorId: string;
    authType: string;
    connectedAt: string;
    updatedAt: string;
    source: 'user' | 'github-app' | 'custom' | 'oauth';
    name?: string;
    scopes?: string[];
    needsReauthorization?: boolean;
    health?: ConnectorHealth;
  };

  const operatorMappedIds = getOperatorMappedConnectorIds();
  const connectors: ConnectorEntry[] = rows
    .filter((c) => operatorMappedIds.has(c.connector_id))
    .map((c) => ({
      id: c.id,
      connectorId: c.connector_id,
      authType: c.auth_type,
      connectedAt: c.connected_at,
      updatedAt: c.updated_at,
      source: 'user',
    }));

  const installations = await getUserGithubInstallations(userId);
  if (installations.length > 0 && !connectors.some((c) => c.connectorId === GITHUB_CONNECTOR_ID)) {
    connectors.push({
      id: `github-app-${installations[0]!.installationId}`,
      connectorId: GITHUB_CONNECTOR_ID,
      authType: 'github_app',
      connectedAt: '',
      updatedAt: '',
      source: 'github-app',
    });
  }

  const oauthGrants = await getUserConnectorOAuthGrantSummaries(userId);
  for (const grant of oauthGrants) {
    if (!isConnectorOAuthSupported(grant.connectorId)) continue;
    if (connectors.some((c) => c.connectorId === grant.connectorId)) continue;
    connectors.push({
      id: `oauth-${grant.connectorId}`,
      connectorId: grant.connectorId,
      authType: 'oauth',
      connectedAt: grant.connectedAt,
      updatedAt: grant.updatedAt,
      source: 'oauth',
      scopes: grant.grantedScopes,
      needsReauthorization: grant.needsReauthorization,
    });
  }

  const customConnectors = await getUserCustomConnectorSummaries(userId);
  for (const c of customConnectors) {
    connectors.push({
      id: c.id,
      connectorId: `custom-${c.shortId}`,
      authType: 'custom_mcp',
      connectedAt: c.createdAt,
      updatedAt: c.updatedAt,
      source: 'custom',
      name: c.name,
    });
  }

  const available = getAvailableConnectorIds();
  const availableSet = new Set(available);
  const withHealth: ConnectorEntry[] = connectors.map((entry) =>
    entry.source === 'custom'
      ? { ...entry, health: 'connected' as const }
      : {
          ...entry,
          health: resolveConnectorHealth({
            connectorId: entry.connectorId,
            available: availableSet.has(entry.connectorId),
            connected: true,
            needsReauthorization: entry.needsReauthorization === true,
          }),
        },
  );

  return NextResponse.json({ connectors: withHealth, available });
}

async function handleCreateConnector(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  let body: { connectorId?: string; authType?: string };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (!body.connectorId || typeof body.connectorId !== 'string') {
    throw createError.validation('connectorId is required');
  }

  const operatorMappedIds = getOperatorMappedConnectorIds();
  if (
    !isKnownConnectorId(body.connectorId) &&
    !operatorMappedIds.has(body.connectorId) &&
    !isConnectorOAuthConfigured(body.connectorId)
  ) {
    throw createError.validation('Invalid connector ID');
  }

  const isLocal = isDeviceLocalConnector(body.connectorId);
  if (isLocal) {
    return NextResponse.json(
      {
        error: 'This connector is device-local. Connect it from Desktop Local settings instead.',
        connectorId: body.connectorId,
      },
      { status: 501 },
    );
  }

  const authType = body.authType ?? 'oauth';
  if (!['local', 'oauth', 'api_key', 'connection_string', 'pat'].includes(authType)) {
    throw createError.validation('Invalid auth type');
  }

  if (body.connectorId === GITHUB_CONNECTOR_ID) {
    if (!isGitHubInstallationLinkingAvailable()) {
      return NextResponse.json(
        {
          error:
            'GitHub installation ownership verification is not available in this deployment. The connector stays disabled until the GitHub user authorization flow is configured.',
          connectorId: body.connectorId,
        },
        { status: 501 },
      );
    }
    const installUrl = getGitHubAppInstallUrl();
    return NextResponse.json(
      {
        error: 'GitHub connects through the GitHub App install flow, not a directory toggle.',
        connectorId: body.connectorId,
        ...(installUrl ? { installStartPath: '/api/github/install/start' } : {}),
      },
      { status: installUrl ? 409 : 501 },
    );
  }

  if (!operatorMappedIds.has(body.connectorId) && isConnectorOAuthSupported(body.connectorId)) {
    if (!isConnectorTokenStorageAvailable()) {
      return NextResponse.json(
        { error: CONNECTOR_TOKEN_STORAGE_UNAVAILABLE, connectorId: body.connectorId },
        { status: 503 },
      );
    }
    const startPath = buildConnectorOAuthStartPath(body.connectorId);
    return NextResponse.json(
      {
        error: 'This connector connects through OAuth authorization, not a directory toggle.',
        connectorId: body.connectorId,
        oauthStartPath: startPath,
        installStartPath: startPath,
      },
      { status: 409 },
    );
  }

  const isOperatorMapped = operatorMappedIds.has(body.connectorId);
  if (!isOperatorMapped) {
    return NextResponse.json(
      {
        error:
          'Connector authorization is not implemented for this provider. Start the provider-specific OAuth or credential flow instead of marking it active.',
        connectorId: body.connectorId,
        authType,
      },
      { status: 501 },
    );
  }

  const now = new Date().toISOString();

  let data: UserConnectorRow | undefined;
  try {
    [data] = await db.query<UserConnectorRow>(
      `insert into user_connectors (user_id, connector_id, auth_type, is_active, connected_at, updated_at)
       values ($1, $2, $3, true, $4, $5)
       on conflict (user_id, connector_id)
       do update set
         auth_type = excluded.auth_type,
         is_active = true,
         connected_at = excluded.connected_at,
         updated_at = excluded.updated_at
       returning id, connector_id, auth_type, connected_at, updated_at`,
      [userId, body.connectorId, authType, now, now],
    );
  } catch (error) {
    if (isUndefinedTable(error)) {
      logger.warn(
        { userId, connectorId: body.connectorId },
        'user_connectors table not migrated; connector save unavailable',
      );
      throw createError.serviceUnavailable('Connectors are not available in this environment');
    }
    throw error;
  }

  if (!data) {
    logger.error({ userId: userId, connectorId: body.connectorId }, 'Failed to save connector');
    throw createError.internal('Failed to save connector');
  }

  await recordAuditEvent({
    userId,
    eventType: 'connector_added',
    request,
    detail: {
      resourceType: 'connector',
      resourceId: data.id,
      connectorId: data.connector_id,
      source: 'catalog',
      status: data.auth_type,
    },
  });

  return NextResponse.json(
    {
      connector: {
        id: data.id,
        connectorId: data.connector_id,
        authType: data.auth_type,
        connectedAt: data.connected_at,
        updatedAt: data.updated_at,
        source: 'user' as const,
      },
    },
    { status: 201 },
  );
}

async function handleDeleteConnector(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);

  const csrfError2 = await requireCsrfToken(request);
  if (csrfError2) return csrfError2 as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const connectorId = url.searchParams.get('connectorId');

  if (
    !connectorId ||
    (!isKnownConnectorId(connectorId) &&
      !getOperatorMappedConnectorIds().has(connectorId) &&
      !isConnectorOAuthConfigured(connectorId))
  ) {
    throw createError.validation('Valid connectorId query param is required');
  }

  const oauthRevoked = await disconnectConnectorOAuthGrant(userId, connectorId);
  if (oauthRevoked) {
    await evictConnectorOAuthCaches(userId, connectorId);
    await clearConnectorToolPermissions(db, userId, connectorId);
    await recordAuditEvent({
      userId,
      eventType: 'connector_removed',
      request,
      detail: { resourceType: 'connector', connectorId, source: 'oauth' },
    });
    if (connectorId !== GITHUB_CONNECTOR_ID && !getOperatorMappedConnectorIds().has(connectorId)) {
      return NextResponse.json({ success: true });
    }
  }

  if (connectorId === GITHUB_CONNECTOR_ID) {
    try {
      await db.execute(`delete from github_installations where user_id = $1`, [userId]);
    } catch (error) {
      if (!isUndefinedTable(error)) throw error;
    }
    await clearConnectorToolPermissions(db, userId, GITHUB_CONNECTOR_ID);
    await recordAuditEvent({
      userId,
      eventType: 'connector_removed',
      request,
      detail: {
        resourceType: 'connector',
        connectorId: GITHUB_CONNECTOR_ID,
        source: 'github_installation',
      },
    });
    return NextResponse.json({ success: true });
  }

  try {
    await db.execute(
      `update user_connectors
       set is_active = false, updated_at = $1
       where user_id = $2 and connector_id = $3`,
      [new Date().toISOString(), userId, connectorId],
    );
  } catch (error) {
    if (isUndefinedTable(error)) {
      logger.warn({ userId, connectorId }, 'user_connectors table not migrated; delete ignored');
      throw createError.serviceUnavailable('Connectors are not available in this environment');
    }
    throw error;
  }

  await clearConnectorToolPermissions(db, userId, connectorId);

  await recordAuditEvent({
    userId,
    eventType: 'connector_removed',
    request,
    detail: { resourceType: 'connector', connectorId, source: 'catalog' },
  });

  return NextResponse.json({ success: true });
}

export const GET = withCorsRoute(withErrorHandler(handleGetConnectors));
export const POST = withCorsRoute(withErrorHandler(handleCreateConnector));
export const DELETE = withCorsRoute(withErrorHandler(handleDeleteConnector));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
