/**
 * Custom remote MCP connectors API
 *
 * GET    /api/connectors/custom       - list the signed-in user's custom connectors
 * POST   /api/connectors/custom       - add + persist a new custom connector
 * DELETE /api/connectors/custom?id=   - remove one of the user's custom connectors
 *
 * Claude.ai parity: unlike `/api/connectors` (an enablement gate over
 * operator-configured or first-party connectors — see lib/user-connector-tools.ts),
 * these rows ARE the credential store. Each row belongs to exactly one user
 * (RLS-enforced) and is never shared cross-user. POST performs a live
 * connect-and-list (via @agiworkforce/mcp) before persisting, so a saved row
 * is known-good at save time; the chat tool loop re-validates at use time
 * (lib/user-connector-tools.ts) since servers can go away later.
 *
 * SECURITY:
 *   - https-only, DNS-resolved public hostname (assertResolvedPublicHostname
 *     via lib/mcp-url-validation.ts), no embedded credentials — same rule as
 *     /api/mcp.
 *   - Optional bearer token is encrypted at rest (lib/custom-connector-crypto.ts)
 *     and never returned by GET.
 *   - Auth + CSRF + rate-limit on every state-changing request.
 */

import { randomBytes } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { connectMcpServer } from '@agiworkforce/mcp';

import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { validateHttpsMcpUrl } from '@/lib/mcp-url-validation';
import { encryptConnectorToken } from '@/lib/custom-connector-crypto';
import { evictCustomConnectorCaches } from '@/lib/user-connector-tools';
import { getUserCustomConnectorSummaries } from '@/lib/user-connector-tools';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  getCustomRemoteMcpLimit,
  getCustomRemoteMcpLimitErrorMessage,
  isUserResourceLimitError,
} from '@/lib/services/free-plan-entitlements';

export const runtime = 'nodejs';

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNIQUE_VIOLATION = '23505';

function pgErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  return (error as Record<string, unknown>)['code'] as string | undefined;
}

function isUndefinedTable(error: unknown): boolean {
  return (
    pgErrorCode(error) === PG_UNDEFINED_TABLE ||
    String((error as { message?: unknown })?.message ?? '').includes('does not exist')
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    pgErrorCode(error) === PG_UNIQUE_VIOLATION ||
    String((error as { message?: unknown })?.message ?? '')
      .toLowerCase()
      .includes('unique')
  );
}

/** Distinguishes the short_id backstop constraint from the (user_id, url) one,
 *  when the driver surfaces a `constraint` name — degrades to "unknown" (and
 *  thus the url-conflict message) if it doesn't, which is the overwhelmingly
 *  more likely case in practice given allocateShortId's pre-check. */
function isShortIdViolation(error: unknown): boolean {
  const constraint = (error as Record<string, unknown> | null)?.['constraint'];
  return typeof constraint === 'string' && constraint.includes('short_id');
}

interface CustomConnectorRow {
  id: string;
  short_id: string;
  name: string;
  url: string;
  transport: string;
  created_at: string;
  updated_at: string;
}

const SHORT_ID_MAX_ATTEMPTS = 5;

/**
 * Allocate a short_id unused by this user. Needed because the chat tool loop
 * embeds it in a provider-facing function name (`mcp__custom-<short_id>__<tool>`,
 * see lib/user-connector-tools.ts) that OpenAI-family providers cap at 64
 * chars — the full 36-char row `id` would alone consume 50 of those. 10 hex
 * chars (40 bits) makes a same-user collision practically impossible; this
 * loop is a courtesy check, and the DB's `user_custom_connectors_short_id_unique`
 * constraint is the hard backstop if it ever fires anyway.
 */
async function allocateShortId(db: ReturnType<typeof getNeonDb>, userId: string): Promise<string> {
  for (let attempt = 0; attempt < SHORT_ID_MAX_ATTEMPTS; attempt++) {
    const candidate = randomBytes(5).toString('hex');
    try {
      const rows = await db.query<{ exists: boolean }>(
        `select exists(select 1 from user_custom_connectors where user_id = $1 and short_id = $2) as exists`,
        [userId, candidate],
      );
      if (!rows[0]?.exists) return candidate;
    } catch (error) {
      if (isUndefinedTable(error)) return candidate; // table doesn't exist yet — insert will surface the real error
      throw error;
    }
  }
  throw createError.internal('Could not allocate a connector identifier. Try again.');
}

// ─── GET: list the user's custom connectors ────────────────────────────────

async function handleGet(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const connectors = await getUserCustomConnectorSummaries(userId);

  return NextResponse.json({ connectors });
}

// ─── POST: add a new custom connector ───────────────────────────────────────

interface CreateBody {
  name?: string;
  url?: string;
  transport?: 'sse' | 'streamable-http';
  authToken?: string;
}

async function handlePost(request: NextRequest) {
  const { userId } = await getClerkAuthUser(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    throw createError.validation('Invalid JSON body');
  }

  const name = body.name?.trim();
  if (!name || name.length > 200) {
    throw createError.validation('name is required (1–200 chars)');
  }

  const db = getNeonDb();
  const subscription = await SubscriptionService.getSubscription(db, userId);
  const planTier = subscription?.plan_tier;
  const connectorLimit = getCustomRemoteMcpLimit(planTier);
  if (connectorLimit === 0) {
    throw createError.validation(getCustomRemoteMcpLimitErrorMessage(planTier));
  }

  const parsedUrl = await validateHttpsMcpUrl(body.url);

  const transport: 'sse' | 'streamable-http' =
    body.transport === 'sse' || body.transport === 'streamable-http'
      ? body.transport
      : parsedUrl.pathname.endsWith('/sse')
        ? 'sse'
        : 'streamable-http';

  const authToken = typeof body.authToken === 'string' ? body.authToken.trim() : '';
  if (authToken.length > 4096) {
    throw createError.validation('authToken is too long');
  }

  // Enforce the per-user cap before doing any network work.
  let existingCount: { count: string }[];
  try {
    existingCount = await db.query<{ count: string }>(
      `select count(*)::text as count from user_custom_connectors where user_id = $1`,
      [userId],
    );
  } catch (error) {
    if (isUndefinedTable(error)) {
      existingCount = [{ count: '0' }];
    } else {
      throw error;
    }
  }
  if (connectorLimit !== null && Number(existingCount[0]?.count ?? '0') >= connectorLimit) {
    throw createError.validation(getCustomRemoteMcpLimitErrorMessage(planTier));
  }

  const shortId = await allocateShortId(db, userId);

  // Live connect-and-list: a saved connector must actually work at save time.
  // SSRF re-validated implicitly — validateHttpsMcpUrl already resolved the
  // hostname above, and connectMcpServer only ever dials `parsedUrl` itself.
  let toolCount = 0;
  try {
    const handle = await connectMcpServer({
      serverName: name,
      config: {
        url: parsedUrl.toString(),
        transport,
        ...(authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}),
        connectionTimeoutMs: 30_000,
      },
    });
    toolCount = handle.catalog.tools.length;
    await handle.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ userId, name, message }, '[connectors/custom] connect-and-list failed');
    throw createError.serviceUnavailable(`Failed to connect to MCP server: ${message}`);
  }

  const now = new Date().toISOString();
  const authHeaderEnc = authToken ? encryptConnectorToken(authToken) : null;

  let saved: CustomConnectorRow | undefined;
  try {
    [saved] = await db.query<CustomConnectorRow>(
      `with inserted as materialized (
         insert into user_custom_connectors
           (user_id, name, url, auth_header_enc, transport, short_id, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $7)
         returning id, short_id, name, url, transport, created_at, updated_at
       ), quota_guard as materialized (
         select public.assert_user_resource_limit('custom_connectors', $1, $8)
           from (select count(*) from inserted) as dependency
       )
       select inserted.* from inserted cross join quota_guard`,
      [userId, name, parsedUrl.toString(), authHeaderEnc, transport, shortId, now, connectorLimit],
    );
  } catch (error) {
    if (isUndefinedTable(error)) {
      throw createError.serviceUnavailable(
        'Custom connectors are not available in this environment',
      );
    }
    if (isUniqueViolation(error)) {
      if (isShortIdViolation(error)) {
        throw createError.serviceUnavailable(
          'Could not allocate a connector identifier. Try again.',
        );
      }
      throw createError.conflict('You already have a custom connector for this URL.');
    }
    if (isUserResourceLimitError(error)) {
      throw createError.validation(getCustomRemoteMcpLimitErrorMessage(planTier));
    }
    throw error;
  }

  if (!saved) {
    logger.error({ userId, name }, '[connectors/custom] insert returned no row');
    throw createError.internal('Failed to save connector');
  }

  return NextResponse.json(
    {
      connector: {
        id: saved.id,
        // Chat-facing id: this connector's tools appear as
        // mcp__custom-<shortId>__<tool> in conversations.
        shortId: saved.short_id,
        name: saved.name,
        url: saved.url,
        transport: saved.transport,
        createdAt: saved.created_at,
        updatedAt: saved.updated_at,
      },
      toolCount,
    },
    { status: 201 },
  );
}

// ─── DELETE: remove a custom connector ──────────────────────────────────────

async function handleDelete(request: NextRequest) {
  const { userId } = await getClerkAuthUser(request);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    throw createError.validation('id query param is required');
  }

  const db = getNeonDb();
  let deleted: { id: string; short_id: string }[] = [];
  try {
    deleted = await db.query<{ id: string; short_id: string }>(
      `delete from user_custom_connectors where id = $1 and user_id = $2 returning id, short_id`,
      [id, userId],
    );
  } catch (error) {
    if (isUndefinedTable(error)) {
      throw createError.serviceUnavailable(
        'Custom connectors are not available in this environment',
      );
    }
    throw error;
  }

  // Release the cached catalog + open MCP handle now rather than leaking the
  // connection until process restart.
  for (const row of deleted) {
    await evictCustomConnectorCaches(userId, row.id);
  }

  // AUDIT-FIX CON-6: drop the saved per-tool verdicts too. The connector's MCP
  // serverId is `custom-<short_id>`, which is what the permission rows are
  // keyed on. Leaving them behind meant a user who deleted a custom connector
  // and later re-added the SAME server (short_id is stable per user+row, but a
  // re-added row reuses the connector id namespace) could have an old
  // "Always allow" silently re-arm. Best-effort: the rows are already
  // unreachable at this point, so a cleanup failure must not fail the delete.
  for (const row of deleted) {
    try {
      await db.execute(
        `delete from public.connector_tool_permissions where user_id = $1 and connector_id = $2`,
        [userId, `custom-${row.short_id}`],
      );
    } catch (error) {
      if (isUndefinedTable(error)) continue;
      logger.warn(
        { userId, rowId: row.id, error },
        'Custom connector tool permissions could not be cleared on delete',
      );
    }
  }

  return NextResponse.json({ success: true });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handlePost));
export const DELETE = withCorsRoute(withErrorHandler(handleDelete));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
