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
import {
  getOperatorMappedConnectorIds,
  getUserGithubInstallations,
  getUserCustomConnectorSummaries,
} from '@/lib/user-connector-tools';
import { getGitHubAppInstallUrl, isGitHubAppConfigured } from '@/lib/github-app';

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

// Allowlist of valid connector IDs to prevent arbitrary data injection
const VALID_CONNECTOR_IDS = new Set([
  'gmail',
  'google-calendar',
  'google-drive',
  'notion',
  'slack',
  'github',
  'google-sheets',
  'outlook',
  'onedrive',
  'linear',
  'jira',
  'teams',
  'confluence',
  'asana',
  'zoom',
  'hubspot',
  'salesforce',
  'calendly',
  'intercom',
  'google-analytics',
  'mailchimp',
  'stripe',
  'shopify',
  'linkedin',
  'twitter',
  'discord',
  'openai',
  'elevenlabs',
  'local-filesystem',
  'terminal',
  'browser-automation',
  'screen-vision',
  'ollama',
]);

const LOCAL_CONNECTOR_IDS = new Set([
  'local-filesystem',
  'terminal',
  'browser-automation',
  'screen-vision',
  'ollama',
]);

// ─── GET: list connected services ──────────────────────────────────────────────

/**
 * Connector ids that can actually be used by managed-cloud chat in this
 * deployment: operator-mapped remote MCP connectors, and github when the App
 * install flow is configured. Device-local connectors deliberately stay out
 * of this Cloud API.
 */
function getAvailableConnectorIds(): string[] {
  const available = new Set<string>();
  for (const id of getOperatorMappedConnectorIds()) available.add(id);
  if (isGitHubAppConfigured() && getGitHubAppInstallUrl()) available.add(GITHUB_CONNECTOR_ID);
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
    source: 'user' | 'github-app' | 'custom';
    /** Display name — only populated for `source: 'custom'` (no static catalog entry exists for these). */
    name?: string;
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

  return NextResponse.json({ connectors, available: getAvailableConnectorIds() });
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
  if (!VALID_CONNECTOR_IDS.has(body.connectorId) && !operatorMappedIds.has(body.connectorId)) {
    throw createError.validation('Invalid connector ID');
  }

  // Device-local connectors belong to Desktop Local mode. A cloud API row
  // cannot make the managed runtime reach a user's filesystem, terminal,
  // browser, screen, or Ollama instance, so never persist one here.
  const isLocal = LOCAL_CONNECTOR_IDS.has(body.connectorId);
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
    (!VALID_CONNECTOR_IDS.has(connectorId) && !getOperatorMappedConnectorIds().has(connectorId))
  ) {
    throw createError.validation('Valid connectorId query param is required');
  }

  const db = getNeonDb();

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

  return NextResponse.json({ success: true });
}

export const GET = withCorsRoute(withErrorHandler(handleGetConnectors));
export const POST = withCorsRoute(withErrorHandler(handleCreateConnector));
export const DELETE = withCorsRoute(withErrorHandler(handleDeleteConnector));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
