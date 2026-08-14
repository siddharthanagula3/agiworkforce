/**
 * Connectors API
 *
 * GET    /api/connectors - List user's connected services
 * POST   /api/connectors - Save a new connector connection
 * DELETE /api/connectors - Remove a connector connection
 *
 * Connection semantics (honest model — see lib/user-connector-tools.ts):
 * - `user_connectors` rows are an enablement gate with runtime effect for
 *   operator-mapped remote MCP connectors. Device-local connectors are owned
 *   by the native Local-mode boundary and are never advertised by this Cloud
 *   API. POST 501s anything else so the UI cannot show a fake connected state.
 * - The github built-in is backed by GitHub App installations, not
 *   user_connectors: GET reports it from `github_installations`, POST directs
 *   callers to the install flow, DELETE unlinks the user's installations.
 * - GET also returns `available`: the connector ids that can actually be
 *   connected right now in this deployment, so the directory UI can render
 *   Connect vs Request-access from real capability instead of static data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
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

const GITHUB_CONNECTOR_ID = 'github';

/**
 * AUDIT-FIX CON-6: drop the user's saved per-tool verdicts for a connector when
 * they disconnect it.
 *
 * Disconnecting left `connector_tool_permissions` rows intact and reusable, so
 * an "Always allow" set months earlier silently re-armed the moment the
 * connector was reconnected — including after a user disconnected specifically
 * BECAUSE they no longer trusted it. Reconnecting must start from the default
 * (ask), not from a policy the user believed they had discarded.
 *
 * Best-effort: a connector is already disconnected at this point, and the tool
 * loop will not offer its tools regardless, so a cleanup failure must not turn
 * a successful disconnect into an error. It is logged, not swallowed.
 */
async function clearConnectorToolPermissions(
  db: ReturnType<typeof getNeonDb>,
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

/**
 * AUDIT-FIX CRIT-001: the id allowlist and the device-local set are no longer
 * maintained here.
 *
 * They used to be two literal sets in this file. `VALID_CONNECTOR_IDS` listed 34
 * of the catalog's 89 ids, so an operator who registered an OAuth app or mapped
 * an MCP endpoint for any of the other 55 (airtable, gitlab, figma, …) got an id
 * that GET advertised in `available` — the directory rendered a live Connect
 * button — and POST then rejected as "Invalid connector ID". Both sets now come
 * from `lib/connectors/catalog.ts`, which is the same registry the directory
 * copy is generated from, so the two cannot drift again.
 */

// ─── GET: list connected services ──────────────────────────────────────────────

/**
 * Connector ids that can actually be used by managed-cloud chat in this
 * deployment: operator-mapped remote MCP connectors, providers the operator has
 * registered a platform OAuth application for (migration 0097 broker), and
 * github when the App install flow is configured. Device-local connectors
 * deliberately stay out of this Cloud API.
 *
 * Every source here answers the same question — "would clicking Connect
 * actually do something?" — which is what keeps the directory from showing a
 * live-looking control backed by nothing.
 */
function getAvailableConnectorIds(): string[] {
  const available = new Set<string>();
  for (const id of getOperatorMappedConnectorIds()) available.add(id);
  for (const id of getOAuthConfiguredConnectorIds()) available.add(id);
  // Connectors whose own authorization server issues us a client identity —
  // via a metadata document or dynamic registration — need no operator setup
  // at all, so clicking Connect genuinely does something. A `preregistered`
  // endpoint is excluded on purpose: it serves MCP but still requires an
  // operator OAuth app, and listing it would put back exactly the dead button
  // this function exists to prevent.
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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

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
    /** Display name — only populated for `source: 'custom'` (no static catalog entry exists for these). */
    name?: string;
    /** OAuth grants only: the scopes the provider actually granted. */
    scopes?: string[];
    /** OAuth grants only: true when the stored token can no longer be renewed. */
    needsReauthorization?: boolean;
    /**
     * One resolved state per connector, from `resolveConnectorHealth()` in the
     * canonical registry — the server's own answer to "what should the user be
     * told about this connector right now", rather than five booleans the
     * client has to recombine (and could recombine differently on each surface).
     */
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

  // The github built-in is backed by GitHub App installations, not
  // user_connectors (POST 501s github), so derive its connected state from the
  // real signal — otherwise the directory shows "not connected" while github
  // tools actively work in chat.
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

  // Per-user OAuth grants (migration 0097). These are the connectors the user
  // authorized through the platform's own OAuth app; the grant IS the connected
  // state, so — like github — no user_connectors row is involved and none is
  // written. A grant whose provider has since been de-configured is skipped:
  // the tool loop cannot use it either, so reporting it as connected would lie.
  const oauthGrants = await getUserConnectorOAuthGrantSummaries(userId);
  for (const grant of oauthGrants) {
    if (!isConnectorOAuthConfigured(grant.connectorId)) continue;
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

  // User-added custom remote MCP connectors (/api/connectors/custom). These
  // have no static catalog entry (unlike the allowlisted ids above), so each
  // one is surfaced with its own display name and a `custom-<row id>` id —
  // the same namespacing the chat tool loop uses (lib/user-connector-tools.ts).
  const customConnectors = await getUserCustomConnectorSummaries(userId);
  for (const c of customConnectors) {
    connectors.push({
      id: c.id,
      // custom-<shortId> is the EXACT serverId the chat tool loop uses for
      // this connector (uuid would overflow OpenAI's 64-char function-name
      // cap), so clients can correlate directory rows with tool calls. The
      // row uuid stays in `id` for /api/connectors/custom?id= deletes.
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
  // Health is attached last so every entry — user row, GitHub App installation,
  // OAuth grant, custom MCP — goes through the same resolver. A `custom-…` id
  // has no registry record on purpose; the resolver's fail-closed default would
  // report it `not-configured`, which is wrong for a connector the user just
  // added, so those keep the connected state their own source proves.
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

// ─── POST: save new connection ─────────────────────────────────────────────────

async function handleCreateConnector(request: NextRequest) {
  const { userId } = await getClerkAuthUser(request);

  // CSRF protection for state-changing POST endpoint
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
  // The three sources that make an id real must be the SAME three GET reports in
  // `available` and DELETE accepts. VALID_CONNECTOR_IDS covers 34 of the 89
  // catalog entries, so without the OAuth arm an operator who registers a
  // platform OAuth app for any of the other 55 (airtable, gitlab, figma, …) gets
  // an id that GET advertises as available — the directory renders a live
  // Connect button for it — and POST then rejects with "Invalid connector ID"
  // instead of handing back the 409 + oauthStartPath that opens consent.
  if (
    !isKnownConnectorId(body.connectorId) &&
    !operatorMappedIds.has(body.connectorId) &&
    !isConnectorOAuthConfigured(body.connectorId)
  ) {
    throw createError.validation('Invalid connector ID');
  }

  // Device-local connectors belong to Desktop Local mode. A cloud API row
  // cannot make the managed runtime reach a user's filesystem, terminal,
  // browser, screen, or Ollama instance, so never persist one here.
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

  // A provider with a registered platform OAuth app connects by running the
  // authorization-code flow, not by flipping a row. Mirrors the github 409:
  // tell the caller exactly where to send the user.
  //
  // A connector with a self-service MCP endpoint takes the SAME 409, because it
  // also connects by authorization rather than by a row — the difference is
  // only where the endpoints come from (live discovery instead of the registry),
  // and `/api/connectors/oauth/start` decides that internally. Sharing the
  // branch is what keeps the directory from needing to know which kind it is.
  if (
    !operatorMappedIds.has(body.connectorId) &&
    (isConnectorOAuthConfigured(body.connectorId) || isSelfServiceConnector(body.connectorId))
  ) {
    const startPath = buildConnectorOAuthStartPath(body.connectorId);
    return NextResponse.json(
      {
        error: 'This connector connects through OAuth authorization, not a directory toggle.',
        connectorId: body.connectorId,
        oauthStartPath: startPath,
        // Compatibility alias. The web directory
        // (features/connectors/hooks/use-connectors.ts) already follows
        // `installStartPath` on a 409 — it was added for the GitHub App install
        // flow — and without this a correctly configured OAuth connector would
        // show a generic "could not connect" toast instead of opening the
        // provider's consent screen. Remove once that hook reads
        // `oauthStartPath`; both fields carry the same value today.
        installStartPath: startPath,
      },
      { status: 409 },
    );
  }

  // Operator-mapped remote MCP connectors are honestly connectable: the
  // endpoint + credentials live server-side and lib/user-connector-tools gates
  // tool-offering on exactly this user_connectors row.
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

  const db = getNeonDb();
  const now = new Date().toISOString();

  // Upsert: local connectors do not require OAuth/API credentials.
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

  // Audit: connector enabled. Only the connector id and auth mechanism are
  // recorded — credentials for this connector live in the OAuth/token stores
  // and are never in scope here.
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
      // Same entry shape as GET's `connectors` rows (source included) so
      // clients can merge a POST result into a list without special-casing.
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

// ─── DELETE: remove connection ─────────────────────────────────────────────────

async function handleDeleteConnector(request: NextRequest) {
  const { userId } = await getClerkAuthUser(request);

  // CSRF protection for state-changing DELETE endpoint
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

  const db = getNeonDb();

  // Disconnecting an OAuth connector must actually destroy the credential:
  // revoke at the provider when it exposes an endpoint, then drop the stored
  // ciphertext (0097 forbids a revoked row from holding one). Runs before the
  // user_connectors soft-delete below so a connector that is BOTH enabled and
  // OAuth-granted is fully torn down by a single request.
  const oauthRevoked = await disconnectConnectorOAuthGrant(userId, connectorId);
  if (oauthRevoked) {
    // Close the live MCP handle too: it holds the now-revoked Authorization
    // header, and without this the connection keeps working until the process
    // restarts even though the grant is gone.
    await evictConnectorOAuthCaches(userId, connectorId);
    await clearConnectorToolPermissions(db, userId, connectorId);
    await recordAuditEvent({
      userId,
      eventType: 'connector_removed',
      request,
      detail: { resourceType: 'connector', connectorId, source: 'oauth' },
    });
    // An OAuth grant is the whole connected state for these providers (no
    // user_connectors row is ever written for them), so stop here unless the id
    // also has one of the other backings below.
    if (connectorId !== GITHUB_CONNECTOR_ID && !getOperatorMappedConnectorIds().has(connectorId)) {
      return NextResponse.json({ success: true });
    }
  }

  if (connectorId === GITHUB_CONNECTOR_ID) {
    // Unlink this user's GitHub App installations so github tools stop being
    // offered. The app itself stays installed on GitHub — full revocation
    // happens at github.com/settings/installations, which the UI points to.
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

  // Soft-delete: mark as inactive rather than removing the row
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
