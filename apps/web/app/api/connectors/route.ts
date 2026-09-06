import { NextRequest, NextResponse } from 'next/server';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { recordAuditEvent } from '@/lib/security-audit';
import { validateHttpsMcpUrl } from '@/lib/mcp-url-validation';
import {
  evictConnectorOAuthCaches,
  evictCustomConnectorCaches,
  findUserCustomConnectorByUrl,
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
import { describeConnectorSetup, type ConnectorSetupKind } from '@/lib/connectors/oauth-setup';
import {
  findDirectoryTargetByRemoteUrl,
  resolveDirectoryConnectAuthMode,
  resolveDirectoryTarget,
  type DirectoryConnectTarget,
} from '@/lib/connectors/mcp-directory-targets';
import {
  assertConnectorToolCapacity,
  assertCustomConnectorCapacity,
  clearConnectorToolPermissions,
  CONNECTOR_UNREACHABLE_CODE,
  customConnectorId,
  deleteCustomConnectorRows,
  insertCustomConnector,
  isUndefinedTableError,
  McpProbeError,
  probeMcpServer,
  type McpProbeResult,
} from '@/lib/connectors/mcp-custom-connections';
import { setCachedToolNames } from '@/lib/connectors/directory/tool-names-cache';
import { CONNECTORS } from '@/features/connectors/data/connectors';

const GITHUB_CONNECTOR_ID = 'github';
const GITHUB_INSTALL_START_PATH = '/api/github/install/start';
const RATE_LIMIT_BUCKET = 'chat-conversation';
const CUSTOM_AUTH_TYPE = 'custom_mcp';
const OAUTH_AUTH_TYPE = 'oauth';
const DIRECTORY_AUDIT_SOURCE = 'directory';
const CUSTOM_AUDIT_RESOURCE_TYPE = 'custom_mcp_connector';
const CREDENTIALS_ROUTE_SEGMENT = 'credentials';
const CONNECTORS_API_PATH = '/api/connectors';
const AUTH_TYPES = ['local', 'oauth', 'api_key', 'connection_string', 'pat'] as const;

const CONNECTOR_SCOPE = { resolveOrganization: false } as const;

type ScopedDb = Awaited<ReturnType<typeof getUserScopedDb>>['db'];

type UserConnectorRow = {
  id: string;
  connector_id: string;
  auth_type: string;
  connected_at: string;
  updated_at: string;
};

type ConnectorSource = 'user' | 'github-app' | 'custom' | 'oauth';

interface ConnectorEntry {
  id: string;
  connectorId: string;
  authType: string;
  connectedAt: string;
  updatedAt: string;
  source: ConnectorSource;
  name?: string;
  toolConnectorId?: string;
  directoryId?: string;
  scopes?: string[];
  needsReauthorization?: boolean;
  health?: ConnectorHealth;
}

interface ConnectorSetupEntry {
  kind: ConnectorSetupKind;
  missingEnv: readonly string[];
  message: string;
}

function unreachableResponse(serverName: string, detail: string): NextResponse {
  const message = `${serverName} could not be reached: ${detail}`;
  return NextResponse.json(
    { error: { code: CONNECTOR_UNREACHABLE_CODE, message }, message },
    { status: 502 },
  );
}

export function credentialsPathFor(connectorId: string): string {
  return `${CONNECTORS_API_PATH}/${encodeURIComponent(connectorId)}/${CREDENTIALS_ROUTE_SEGMENT}`;
}

function getAvailableConnectorIds(): string[] {
  const available = new Set<string>();
  for (const id of getOperatorMappedConnectorIds()) available.add(id);
  for (const id of getOAuthConfiguredConnectorIds()) available.add(id);
  for (const id of connectorIdsWithMcpEndpoint()) {
    if (isSelfServiceConnector(id) && describeConnectorSetup(id) === null) available.add(id);
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

function describeCuratedSetup(available: ReadonlySet<string>): Record<string, ConnectorSetupEntry> {
  const setup: Record<string, ConnectorSetupEntry> = {};
  for (const connector of CONNECTORS) {
    if (available.has(connector.id)) continue;
    const requirement = describeConnectorSetup(connector.id, connector.name);
    if (!requirement) continue;
    setup[connector.id] = {
      kind: requirement.kind,
      missingEnv: requirement.missingEnv,
      message: requirement.message,
    };
  }
  return setup;
}

function isCuratedOrConfiguredId(connectorId: string): boolean {
  return (
    isKnownConnectorId(connectorId) ||
    getOperatorMappedConnectorIds().has(connectorId) ||
    isConnectorOAuthConfigured(connectorId)
  );
}

async function handleGetConnectors(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET);
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
    if (isUndefinedTableError(error)) {
      logger.warn({ userId }, 'user_connectors table not migrated; returning empty connectors');
      rows = [];
    } else {
      throw error;
    }
  }

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
    if (connectors.some((c) => c.connectorId === grant.connectorId)) continue;
    const base = {
      id: `oauth-${grant.connectorId}`,
      connectorId: grant.connectorId,
      authType: OAUTH_AUTH_TYPE,
      connectedAt: grant.connectedAt,
      updatedAt: grant.updatedAt,
      source: 'oauth' as const,
      scopes: grant.grantedScopes,
      needsReauthorization: grant.needsReauthorization,
    };
    if (isConnectorOAuthSupported(grant.connectorId)) {
      connectors.push(base);
      continue;
    }
    const target = await resolveDirectoryTarget(grant.connectorId);
    if (!target) continue;
    connectors.push({
      ...base,
      name: target.name,
      toolConnectorId: target.serverId,
      directoryId: target.connectorId,
    });
  }

  const customConnectors = await getUserCustomConnectorSummaries(db, userId);
  for (const c of customConnectors) {
    const linked = await findDirectoryTargetByRemoteUrl(c.url);
    const toolConnectorId = customConnectorId(c.shortId);
    connectors.push({
      id: c.id,
      connectorId: linked ? linked.connectorId : toolConnectorId,
      toolConnectorId,
      ...(linked ? { directoryId: linked.connectorId } : {}),
      authType: CUSTOM_AUTH_TYPE,
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
            available: availableSet.has(entry.connectorId) || entry.directoryId !== undefined,
            connected: true,
            needsReauthorization: entry.needsReauthorization === true,
          }),
        },
  );

  return NextResponse.json({
    connectors: withHealth,
    available,
    setup: describeCuratedSetup(availableSet),
  });
}

function directoryConnectorEntry(
  target: DirectoryConnectTarget,
  row: { id: string; shortId: string; name: string; url: string; transport: string },
  timestamps: { connectedAt: string; updatedAt: string },
): ConnectorEntry {
  return {
    id: row.id,
    connectorId: target.connectorId,
    toolConnectorId: customConnectorId(row.shortId),
    directoryId: target.connectorId,
    authType: CUSTOM_AUTH_TYPE,
    connectedAt: timestamps.connectedAt,
    updatedAt: timestamps.updatedAt,
    source: 'custom',
    name: row.name,
    health: 'connected',
  };
}

async function connectDirectoryTarget(
  request: NextRequest,
  db: ScopedDb,
  userId: string,
  target: DirectoryConnectTarget,
): Promise<NextResponse> {
  const connectorId = target.connectorId;
  const authMode = await resolveDirectoryConnectAuthMode(target);

  if (authMode === 'unknown') {
    const message = `${target.name} does not say how it authenticates and did not answer a discovery probe, so it cannot be connected from the browser yet.`;
    return NextResponse.json({ error: message, message, connectorId }, { status: 501 });
  }

  if (authMode !== 'none' && !isConnectorTokenStorageAvailable()) {
    return NextResponse.json(
      {
        error: CONNECTOR_TOKEN_STORAGE_UNAVAILABLE,
        message: CONNECTOR_TOKEN_STORAGE_UNAVAILABLE,
        connectorId,
      },
      { status: 503 },
    );
  }

  if (authMode === 'oauth') {
    const startPath = buildConnectorOAuthStartPath(connectorId);
    const message = `${target.name} connects through its own authorization page.`;
    return NextResponse.json(
      {
        error: message,
        message,
        connectorId,
        oauthStartPath: startPath,
        installStartPath: startPath,
      },
      { status: 409 },
    );
  }

  if (authMode === 'api-key') {
    const message = `${target.name} needs an API key before it can connect.`;
    return NextResponse.json(
      { error: message, message, connectorId, credentialsPath: credentialsPathFor(connectorId) },
      { status: 409 },
    );
  }

  const existing = await findUserCustomConnectorByUrl(userId, target.mcpUrl);
  if (existing) {
    const now = new Date().toISOString();
    return NextResponse.json({
      connector: directoryConnectorEntry(target, existing, { connectedAt: now, updatedAt: now }),
      alreadyConnected: true,
    });
  }

  const capacity = await assertCustomConnectorCapacity(db, userId);
  const parsedUrl = await validateHttpsMcpUrl(target.mcpUrl);
  const url = parsedUrl.toString();

  let probe: McpProbeResult;
  try {
    probe = await probeMcpServer({
      serverName: target.serverId,
      url,
      transport: target.transport,
      authorizationContext: `user:${userId}:custom-url:${url}`,
    });
  } catch (error) {
    if (error instanceof McpProbeError) return unreachableResponse(target.name, error.message);
    throw error;
  }

  assertConnectorToolCapacity(capacity.planTier, probe.toolCount);

  const saved = await insertCustomConnector(db, {
    userId,
    name: target.name,
    url,
    transport: target.transport,
    credentialEnc: null,
    connectorLimit: capacity.connectorLimit,
  });

  await setCachedToolNames(connectorId, probe.toolNames);

  await recordAuditEvent({
    userId,
    eventType: 'connector_added',
    request,
    detail: {
      resourceType: CUSTOM_AUDIT_RESOURCE_TYPE,
      resourceId: saved.id,
      resourceName: saved.name,
      connectorId: customConnectorId(saved.short_id),
      subjectRef: connectorId,
      transport: saved.transport,
      source: DIRECTORY_AUDIT_SOURCE,
    },
  });

  return NextResponse.json(
    {
      connector: directoryConnectorEntry(
        target,
        {
          id: saved.id,
          shortId: saved.short_id,
          name: saved.name,
          url: saved.url,
          transport: saved.transport,
        },
        { connectedAt: saved.created_at, updatedAt: saved.updated_at },
      ),
      toolCount: probe.toolCount,
      toolNames: probe.toolNames,
      capabilityCounts: probe.capabilityCounts,
      protocolEra: probe.protocolEra,
    },
    { status: 201 },
  );
}

async function handleCreateConnector(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET);
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
  if (!isCuratedOrConfiguredId(body.connectorId)) {
    const target = await resolveDirectoryTarget(body.connectorId);
    if (!target) throw createError.validation('Invalid connector ID');
    return connectDirectoryTarget(request, db, userId, target);
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

  const authType = body.authType ?? OAUTH_AUTH_TYPE;
  if (!(AUTH_TYPES as readonly string[]).includes(authType)) {
    throw createError.validation('Invalid auth type');
  }

  if (body.connectorId === GITHUB_CONNECTOR_ID) {
    if (!isGitHubInstallationLinkingAvailable()) {
      return NextResponse.json(
        {
          error:
            'GitHub installation ownership verification is not available in this deployment. The connector stays disabled until the GitHub user authorization flow is configured.',
          connectorId: body.connectorId,
          setup: describeConnectorSetup(body.connectorId),
        },
        { status: 501 },
      );
    }
    const installUrl = getGitHubAppInstallUrl();
    return NextResponse.json(
      {
        error: 'GitHub connects through the GitHub App install flow, not a directory toggle.',
        connectorId: body.connectorId,
        ...(installUrl ? { installStartPath: GITHUB_INSTALL_START_PATH } : {}),
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
    const setup = describeConnectorSetup(body.connectorId);
    if (setup) {
      return NextResponse.json(
        { error: setup.message, message: setup.message, connectorId: body.connectorId, setup },
        { status: 501 },
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
    const setup = describeConnectorSetup(body.connectorId);
    return NextResponse.json(
      {
        error:
          'Connector authorization is not implemented for this provider. Start the provider-specific OAuth or credential flow instead of marking it active.',
        ...(setup ? { message: setup.message, setup } : {}),
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
    if (isUndefinedTableError(error)) {
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

async function disconnectDirectoryTarget(
  request: NextRequest,
  db: ScopedDb,
  userId: string,
  target: DirectoryConnectTarget,
): Promise<NextResponse> {
  const row = await findUserCustomConnectorByUrl(userId, target.mcpUrl);
  if (row) {
    const deleted = await deleteCustomConnectorRows(db, userId, row.id);
    for (const removed of deleted) {
      await evictCustomConnectorCaches(userId, removed.id);
      await clearConnectorToolPermissions(db, userId, customConnectorId(removed.short_id));
      await recordAuditEvent({
        userId,
        eventType: 'connector_removed',
        request,
        detail: {
          resourceType: CUSTOM_AUDIT_RESOURCE_TYPE,
          resourceId: removed.id,
          connectorId: customConnectorId(removed.short_id),
          subjectRef: target.connectorId,
          source: DIRECTORY_AUDIT_SOURCE,
        },
      });
    }
  }

  if (await disconnectConnectorOAuthGrant(userId, target.connectorId)) {
    await evictConnectorOAuthCaches(userId, target.connectorId);
    await clearConnectorToolPermissions(db, userId, target.serverId);
    await recordAuditEvent({
      userId,
      eventType: 'connector_removed',
      request,
      detail: {
        resourceType: 'connector',
        connectorId: target.connectorId,
        source: DIRECTORY_AUDIT_SOURCE,
      },
    });
  }

  return NextResponse.json({ success: true });
}

async function handleDeleteConnector(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);

  const csrfError2 = await requireCsrfToken(request);
  if (csrfError2) return csrfError2 as NextResponse;

  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const connectorId = url.searchParams.get('connectorId');

  if (!connectorId) {
    throw createError.validation('Valid connectorId query param is required');
  }

  if (!isCuratedOrConfiguredId(connectorId)) {
    const target = await resolveDirectoryTarget(connectorId);
    if (!target) throw createError.validation('Valid connectorId query param is required');
    return disconnectDirectoryTarget(request, db, userId, target);
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
      if (!isUndefinedTableError(error)) throw error;
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
    if (isUndefinedTableError(error)) {
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
