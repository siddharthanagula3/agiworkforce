import { NextRequest, NextResponse } from 'next/server';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { evaluateConnectorPolicyForUser } from '@/lib/services/connector-policy-gate';
import {
  ConnectRequestSchema,
  connectorCredentialsPath,
  type ConnectConflictResponse,
  type ConnectSuccessResponse,
  type ConnectorConnection,
  type ConnectorProbeFailureResponse,
  type ConnectorSetupEntry,
  type DisconnectFailureResponse,
  type DisconnectResponse,
  type ListConnectorsResponse,
} from '@agiworkforce/cloud-contracts';
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
  deleteGitHubAppInstallation,
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
} from '@/lib/connectors/catalog';
import { readConnectorsNotResponding } from '@/lib/services/connector-call-log-service';
import {
  getUserConnectorOAuthGrantSummaries,
  listConnectorAccounts,
} from '@/lib/connectors/oauth-store';
import {
  disconnectConnectorOAuthGrant,
  vendorRevocationAuditStatus,
  vendorRevocationNotice,
  type ConnectorDisconnectOutcome,
} from '@/lib/connectors/oauth-access';
import {
  mcpAuthorizationContext,
  purgeMcpResponseCachePartitions,
} from '@/lib/connectors/mcp-runtime-cache';
import {
  CONNECTOR_TOKEN_STORAGE_UNAVAILABLE,
  isConnectorTokenStorageAvailable,
} from '@/lib/custom-connector-crypto';
import {
  describeConnectorSetup,
  regionRequirement,
  type ConnectorSetupRequirement,
} from '@/lib/connectors/oauth-setup';
import {
  BANK_ACCOUNTS_CONNECTOR_ID,
  BANK_ACCOUNTS_EXCHANGE_PATH,
  BANK_ACCOUNTS_LINK_PATH,
} from '@/lib/connectors/plaid-config';
import {
  accountUrlConnector,
  ACCOUNT_URL_CONNECTORS,
} from '@/lib/connectors/account-url-connectors';
import { describeGrantedConnectorScopes } from '@/lib/connectors/scope-descriptions';
import {
  SENSITIVE_DATA_CONNECTOR_IDS,
  sensitiveDataRegionRefusal,
} from '@/lib/connectors/sensitive-data-connectors';
import { listPendingConnectorIds } from '@/lib/connectors/oauth-store';
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
  CONNECTOR_BLOCKED_CODE,
  CONNECTOR_UNREACHABLE_CODE,
  customConnectorId,
  deleteCustomConnectorRows,
  edgeBlockedMessage,
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

function unreachableResponse(serverName: string, error: McpProbeError): NextResponse {
  if (error.edgeBlocked) {
    const message = edgeBlockedMessage(serverName);
    return NextResponse.json(
      {
        error: { code: CONNECTOR_BLOCKED_CODE, message },
        message,
      } satisfies ConnectorProbeFailureResponse,
      { status: 502 },
    );
  }
  const message = `${serverName} could not be reached: ${error.message}`;
  return NextResponse.json(
    {
      error: { code: CONNECTOR_UNREACHABLE_CODE, message },
      message,
    } satisfies ConnectorProbeFailureResponse,
    { status: 502 },
  );
}

function setupEntry(requirement: ConnectorSetupRequirement): ConnectorSetupEntry {
  return {
    kind: requirement.kind,
    missingEnv: [...requirement.missingEnv],
    message: requirement.message,
  };
}

function getAvailableConnectorIds(): string[] {
  const available = new Set<string>();
  for (const id of getOperatorMappedConnectorIds()) available.add(id);
  for (const id of getOAuthConfiguredConnectorIds()) available.add(id);
  for (const id of connectorIdsWithMcpEndpoint()) {
    if (isSelfServiceConnector(id) && describeConnectorSetup(id) === null) available.add(id);
  }
  if (describeConnectorSetup(BANK_ACCOUNTS_CONNECTOR_ID) === null) {
    available.add(BANK_ACCOUNTS_CONNECTOR_ID);
  }
  for (const { connectorId } of ACCOUNT_URL_CONNECTORS) {
    if (describeConnectorSetup(connectorId) === null) available.add(connectorId);
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

function connectorDisplayName(connectorId: string): string {
  return CONNECTORS.find((connector) => connector.id === connectorId)?.name ?? connectorId;
}

function describeCuratedSetup(available: ReadonlySet<string>): Record<string, ConnectorSetupEntry> {
  const setup: Record<string, ConnectorSetupEntry> = {};
  for (const connector of CONNECTORS) {
    if (available.has(connector.id)) continue;
    const requirement = describeConnectorSetup(connector.id, connector.name);
    if (!requirement) continue;
    setup[connector.id] = setupEntry(requirement);
  }
  return setup;
}

function withRegionRestrictions(
  request: NextRequest,
  available: readonly string[],
  setup: Record<string, ConnectorSetupEntry>,
): { available: string[]; setup: Record<string, ConnectorSetupEntry> } {
  const restricted = new Set<string>();
  const restrictedSetup = { ...setup };
  for (const connectorId of SENSITIVE_DATA_CONNECTOR_IDS) {
    if (!available.includes(connectorId)) continue;
    const refusal = sensitiveDataRegionRefusal(connectorId, request);
    if (!refusal) continue;
    restricted.add(connectorId);
    restrictedSetup[connectorId] = setupEntry(regionRequirement(connectorId, refusal));
  }
  return {
    available: available.filter((connectorId) => !restricted.has(connectorId)),
    setup: restrictedSetup,
  };
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
  const connectors: ConnectorConnection[] = rows
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
      grantedPermissions: describeGrantedConnectorScopes(grant.grantedScopes),
      needsReauthorization: grant.needsReauthorization,
    };
    if (
      isConnectorOAuthSupported(grant.connectorId) ||
      grant.connectorId === BANK_ACCOUNTS_CONNECTOR_ID
    ) {
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
    const signInGrant = oauthGrants.find((grant) => grant.connectorId === toolConnectorId);
    const signInPending =
      c.signInRequired && (!signInGrant || signInGrant.needsReauthorization === true);
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
      ...(c.credentialUnreadable || signInPending ? { needsReauthorization: true } : {}),
    });
  }

  const available = getAvailableConnectorIds();
  const availableSet = new Set(available);
  // Observed from this account's own recent calls. A log that cannot be read
  // leaves every connector on its configuration-derived state rather than
  // failing the panel, which is the same trade the pending list makes below.
  const notResponding = await readConnectorsNotResponding(db, userId).catch(
    () => new Set<string>(),
  );
  const isDown = (entry: ConnectorConnection): boolean =>
    notResponding.has(entry.connectorId) ||
    (entry.toolConnectorId !== undefined && notResponding.has(entry.toolConnectorId));
  const withHealth = connectors.map((entry): ConnectorConnection =>
    entry.source === 'custom'
      ? {
          ...entry,
          health:
            entry.needsReauthorization === true
              ? 'needs-reauthorization'
              : isDown(entry)
                ? 'not-responding'
                : 'connected',
        }
      : {
          ...entry,
          health: resolveConnectorHealth({
            connectorId: entry.connectorId,
            available: availableSet.has(entry.connectorId) || entry.directoryId !== undefined,
            connected: true,
            needsReauthorization: entry.needsReauthorization === true,
            notResponding: isDown(entry),
          }),
        },
  );

  /*
   * Connectors whose authorization was started and never finished. Reported
   * beside the connected list so the directory can tell a reader who walked
   * away mid-flow apart from one who never began.
   */
  const pending = (await listPendingConnectorIds(userId).catch(() => [])).filter(
    (connectorId) => !withHealth.some((entry) => entry.connectorId === connectorId),
  );

  const offered = withRegionRestrictions(request, available, describeCuratedSetup(availableSet));

  return NextResponse.json({
    connectors: withHealth,
    available: offered.available,
    setup: offered.setup,
    pending,
  } satisfies ListConnectorsResponse);
}

function directoryConnectorEntry(
  target: DirectoryConnectTarget,
  row: { id: string; shortId: string; name: string; url: string; transport: string },
  timestamps: { connectedAt: string; updatedAt: string },
): ConnectorConnection {
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
    return NextResponse.json(
      { error: message, message, connectorId } satisfies ConnectConflictResponse,
      { status: 501 },
    );
  }

  if (authMode !== 'none' && !isConnectorTokenStorageAvailable()) {
    return NextResponse.json(
      {
        error: CONNECTOR_TOKEN_STORAGE_UNAVAILABLE,
        message: CONNECTOR_TOKEN_STORAGE_UNAVAILABLE,
        connectorId,
      } satisfies ConnectConflictResponse,
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
      } satisfies ConnectConflictResponse,
      { status: 409 },
    );
  }

  if (authMode === 'api-key') {
    const message = `${target.name} needs an API key before it can connect.`;
    return NextResponse.json(
      {
        error: message,
        message,
        connectorId,
        credentialsPath: connectorCredentialsPath(connectorId),
      } satisfies ConnectConflictResponse,
      { status: 409 },
    );
  }

  const existing = await findUserCustomConnectorByUrl(userId, target.mcpUrl);
  if (existing) {
    const now = new Date().toISOString();
    return NextResponse.json({
      connector: directoryConnectorEntry(target, existing, { connectedAt: now, updatedAt: now }),
      alreadyConnected: true,
    } satisfies ConnectSuccessResponse);
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
      authorizationContext: mcpAuthorizationContext.userCustomUrl(userId, url),
    });
  } catch (error) {
    if (error instanceof McpProbeError) return unreachableResponse(target.name, error);
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
    } satisfies ConnectSuccessResponse,
    { status: 201 },
  );
}

async function handleCreateConnector(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (rateLimitResponse) return rateLimitResponse;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  const parsedBody = ConnectRequestSchema.safeParse(raw);
  if (!parsedBody.success) {
    throw createError.validation('connectorId is required');
  }
  const body = parsedBody.data;

  const operatorMappedIds = getOperatorMappedConnectorIds();
  const directoryTarget = isCuratedOrConfiguredId(body.connectorId)
    ? null
    : await resolveDirectoryTarget(body.connectorId);
  if (!isCuratedOrConfiguredId(body.connectorId) && !directoryTarget) {
    throw createError.validation('Invalid connector ID');
  }

  const policyDecision = await evaluateConnectorPolicyForUser({
    db,
    userId,
    connectorId: body.connectorId,
    ...(directoryTarget ? { isCustom: true, url: directoryTarget.mcpUrl } : {}),
    request,
    surface: resolveCloudChatSurface(request),
  });
  if (!policyDecision.allowed) {
    return NextResponse.json(
      {
        error: policyDecision.reason,
        message: policyDecision.reason,
        connectorId: body.connectorId,
      } satisfies ConnectConflictResponse,
      { status: 403 },
    );
  }
  if (directoryTarget) return connectDirectoryTarget(request, db, userId, directoryTarget);

  const isLocal = isDeviceLocalConnector(body.connectorId);
  if (isLocal) {
    return NextResponse.json(
      {
        error: 'This connector is device-local. Connect it from the released CLI instead.',
        connectorId: body.connectorId,
      } satisfies ConnectConflictResponse,
      { status: 501 },
    );
  }

  const authType = body.authType ?? OAUTH_AUTH_TYPE;
  if (!(AUTH_TYPES as readonly string[]).includes(authType)) {
    throw createError.validation('Invalid auth type');
  }

  if (body.connectorId === GITHUB_CONNECTOR_ID) {
    if (!isGitHubInstallationLinkingAvailable()) {
      const setup = describeConnectorSetup(
        body.connectorId,
        connectorDisplayName(body.connectorId),
      );
      return NextResponse.json(
        {
          error:
            'GitHub installation ownership verification is not available in this deployment. The connector stays disabled until the GitHub user authorization flow is configured.',
          connectorId: body.connectorId,
          setup: setup ? setupEntry(setup) : null,
        } satisfies ConnectConflictResponse,
        { status: 501 },
      );
    }
    const installUrl = getGitHubAppInstallUrl();
    return NextResponse.json(
      {
        error: 'GitHub connects through the GitHub App install flow, not a directory toggle.',
        connectorId: body.connectorId,
        ...(installUrl ? { installStartPath: GITHUB_INSTALL_START_PATH } : {}),
      } satisfies ConnectConflictResponse,
      { status: installUrl ? 409 : 501 },
    );
  }

  const regionRefusal = sensitiveDataRegionRefusal(body.connectorId, request);
  if (regionRefusal) {
    return NextResponse.json(
      {
        error: regionRefusal,
        message: regionRefusal,
        connectorId: body.connectorId,
      } satisfies ConnectConflictResponse,
      { status: 403 },
    );
  }

  const byAccountUrl = accountUrlConnector(body.connectorId);
  if (byAccountUrl) {
    const setup = describeConnectorSetup(body.connectorId, byAccountUrl.name);
    if (setup) {
      return NextResponse.json(
        {
          error: setup.message,
          message: setup.message,
          connectorId: body.connectorId,
          setup: setupEntry(setup),
        } satisfies ConnectConflictResponse,
        { status: 501 },
      );
    }
    const message = `Add ${byAccountUrl.name} in Settings, Connectors, Add custom connector, with your account's MCP server URL.`;
    return NextResponse.json(
      {
        error: message,
        message,
        connectorId: body.connectorId,
        accountUrlConnector: byAccountUrl.connectorId,
      } satisfies ConnectConflictResponse,
      { status: 409 },
    );
  }

  if (body.connectorId === BANK_ACCOUNTS_CONNECTOR_ID) {
    const setup = describeConnectorSetup(body.connectorId, connectorDisplayName(body.connectorId));
    if (setup) {
      return NextResponse.json(
        {
          error: setup.message,
          message: setup.message,
          connectorId: body.connectorId,
          setup: setupEntry(setup),
        } satisfies ConnectConflictResponse,
        { status: 501 },
      );
    }
    const message = 'Bank accounts connect through Plaid, which opens its own sign-in window.';
    return NextResponse.json(
      {
        error: message,
        message,
        connectorId: body.connectorId,
        plaidLinkPath: BANK_ACCOUNTS_LINK_PATH,
        plaidExchangePath: BANK_ACCOUNTS_EXCHANGE_PATH,
      } satisfies ConnectConflictResponse,
      { status: 409 },
    );
  }

  if (!operatorMappedIds.has(body.connectorId) && isConnectorOAuthSupported(body.connectorId)) {
    if (!isConnectorTokenStorageAvailable()) {
      return NextResponse.json(
        {
          error: CONNECTOR_TOKEN_STORAGE_UNAVAILABLE,
          connectorId: body.connectorId,
        } satisfies ConnectConflictResponse,
        { status: 503 },
      );
    }
    const setup = describeConnectorSetup(body.connectorId, connectorDisplayName(body.connectorId));
    if (setup) {
      return NextResponse.json(
        {
          error: setup.message,
          message: setup.message,
          connectorId: body.connectorId,
          setup: setupEntry(setup),
        } satisfies ConnectConflictResponse,
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
      } satisfies ConnectConflictResponse,
      { status: 409 },
    );
  }

  const isOperatorMapped = operatorMappedIds.has(body.connectorId);
  if (!isOperatorMapped) {
    const setup = describeConnectorSetup(body.connectorId, connectorDisplayName(body.connectorId));
    return NextResponse.json(
      {
        error:
          'Connector authorization is not implemented for this provider. Start the provider-specific OAuth or credential flow instead of marking it active.',
        ...(setup ? { message: setup.message, setup: setupEntry(setup) } : {}),
        connectorId: body.connectorId,
        authType,
      } satisfies ConnectConflictResponse,
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
        source: 'user',
      },
    } satisfies ConnectSuccessResponse,
    { status: 201 },
  );
}

async function oauthCacheContexts(userId: string, connectorId: string): Promise<string[]> {
  const accounts = await listConnectorAccounts(userId, connectorId);
  return [
    mcpAuthorizationContext.userOauthConnector(userId, connectorId),
    ...accounts.map((account) =>
      mcpAuthorizationContext.userOauthConnector(userId, connectorId, account.accountKey),
    ),
    mcpAuthorizationContext.operatorConnector(connectorId),
  ];
}

async function disconnectDirectoryTarget(
  request: NextRequest,
  db: ScopedDb,
  userId: string,
  target: DirectoryConnectTarget,
): Promise<NextResponse> {
  const row = await findUserCustomConnectorByUrl(userId, target.mcpUrl);
  const notices: string[] = [];
  if (row) {
    const customDisconnect = await disconnectConnectorOAuthGrant(userId, row.connectorId);
    const customNotice = vendorRevocationNotice(row.name, customDisconnect.vendorRevocation);
    if (customNotice) notices.push(customNotice);
    const deleted = await deleteCustomConnectorRows(db, userId, row.id);
    for (const removed of deleted) {
      await evictCustomConnectorCaches(userId, removed.id);
      await purgeMcpResponseCachePartitions([
        mcpAuthorizationContext.userCustomConnector(userId, removed.id),
        mcpAuthorizationContext.userCustomUrl(userId, target.mcpUrl),
      ]);
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
          status: vendorRevocationAuditStatus(customDisconnect.vendorRevocation),
        },
      });
    }
  }

  const cacheContexts = await oauthCacheContexts(userId, target.connectorId);
  const disconnect = await disconnectConnectorOAuthGrant(userId, target.connectorId);
  const notice = vendorRevocationNotice(target.name, disconnect.vendorRevocation);
  if (notice) notices.push(notice);
  if (disconnect.disconnected) {
    await evictConnectorOAuthCaches(userId, target.connectorId);
    await purgeMcpResponseCachePartitions(cacheContexts);
    await clearConnectorToolPermissions(db, userId, target.serverId);
    await recordAuditEvent({
      userId,
      eventType: 'connector_removed',
      request,
      detail: {
        resourceType: 'connector',
        connectorId: target.connectorId,
        source: DIRECTORY_AUDIT_SOURCE,
        status: vendorRevocationAuditStatus(disconnect.vendorRevocation),
      },
    });
  }

  return NextResponse.json(disconnectedResponse(notices.join(' ')));
}

function disconnectedResponse(vendorNotice: string | null): DisconnectResponse {
  return vendorNotice ? { success: true, vendorNotice } : { success: true };
}

function oauthVendorNotice(connectorId: string, disconnect: ConnectorDisconnectOutcome) {
  return vendorRevocationNotice(connectorDisplayName(connectorId), disconnect.vendorRevocation);
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

  const cacheContexts = await oauthCacheContexts(userId, connectorId);
  const oauthDisconnect = await disconnectConnectorOAuthGrant(userId, connectorId);
  if (oauthDisconnect.disconnected) {
    await evictConnectorOAuthCaches(userId, connectorId);
    await purgeMcpResponseCachePartitions(cacheContexts);
    await clearConnectorToolPermissions(db, userId, connectorId);
    await recordAuditEvent({
      userId,
      eventType: 'connector_removed',
      request,
      detail: {
        resourceType: 'connector',
        connectorId,
        source: 'oauth',
        status: vendorRevocationAuditStatus(oauthDisconnect.vendorRevocation),
      },
    });
    if (connectorId !== GITHUB_CONNECTOR_ID && !getOperatorMappedConnectorIds().has(connectorId)) {
      return NextResponse.json(
        disconnectedResponse(oauthVendorNotice(connectorId, oauthDisconnect)),
      );
    }
  }

  if (connectorId === GITHUB_CONNECTOR_ID) {
    // Deleting the row on its own left the App installed with its granted
    // repository access intact, while the product reported success. The
    // installation is revoked first, and a failure is surfaced rather than
    // reported as a disconnect, exactly as /api/github/installations does.
    let installationRows: Array<{ installation_id: number }> = [];
    try {
      installationRows = await db.query<{ installation_id: number }>(
        'select installation_id from github_installations where user_id = $1',
        [userId],
      );
    } catch (error) {
      if (!isUndefinedTableError(error)) throw error;
    }

    for (const { installation_id: installationId } of installationRows) {
      const revocation = await deleteGitHubAppInstallation(installationId);
      if (revocation.status === 'failed' || revocation.status === 'unavailable') {
        logger.error(
          { userId, installationId, reason: revocation.reason },
          'GitHub App installation was not revoked; connector left connected',
        );
        await recordAuditEvent({
          userId,
          eventType: 'connector_removed',
          request,
          outcome: 'failure',
          severity: 'critical',
          detail: {
            resourceType: 'github_installation',
            resourceId: String(installationId),
            source: 'github',
            reason: revocation.reason,
          },
        });
        return NextResponse.json(
          {
            error:
              revocation.status === 'unavailable'
                ? 'This deployment cannot revoke GitHub App installations, so the app is still installed on your account. Remove it from GitHub, under Settings then Applications.'
                : 'The GitHub App is still installed on your account, so nothing was disconnected. Try again, or remove it from GitHub under Settings then Applications.',
            reason: revocation.reason,
            retryable: revocation.status === 'failed',
          } satisfies DisconnectFailureResponse,
          { status: revocation.status === 'unavailable' ? 503 : 502 },
        );
      }
    }

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
    return NextResponse.json(disconnectedResponse(oauthVendorNotice(connectorId, oauthDisconnect)));
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

  return NextResponse.json(disconnectedResponse(oauthVendorNotice(connectorId, oauthDisconnect)));
}

export const GET = withCorsRoute(withErrorHandler(handleGetConnectors));
export const POST = withCorsRoute(withErrorHandler(handleCreateConnector));
export const DELETE = withCorsRoute(withErrorHandler(handleDeleteConnector));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
