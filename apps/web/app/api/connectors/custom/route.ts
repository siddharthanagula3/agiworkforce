import { randomBytes } from 'crypto';

import { NextRequest, NextResponse } from 'next/server';

import { connectMcpServer } from '@agiworkforce/mcp';
import { MCP_EGRESS_POLICY } from '@/lib/mcp-egress-policy';

import { requireCsrfToken } from '@/lib/csrf';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { validateHttpsMcpUrl } from '@/lib/mcp-url-validation';
import { encryptConnectorToken } from '@/lib/custom-connector-crypto';
import { recordAuditEvent } from '@/lib/security-audit';
import { evictCustomConnectorCaches } from '@/lib/user-connector-tools';
import { getUserCustomConnectorSummaries } from '@/lib/user-connector-tools';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { getBillingPlanPricing, getPlanMaxConnectorTools } from '@agiworkforce/types';
import {
  getCustomRemoteMcpLimit,
  getCustomRemoteMcpLimitErrorMessage,
  isUserResourceLimitError,
} from '@/lib/services/free-plan-entitlements';
import { getMcpStatelessRuntime } from '@/lib/connectors/mcp-runtime-cache';

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

const CONNECTOR_SCOPE = { resolveOrganization: false } as const;

type ScopedDb = Awaited<ReturnType<typeof getUserScopedDb>>['db'];

async function allocateShortId(db: ScopedDb, userId: string): Promise<string> {
  for (let attempt = 0; attempt < SHORT_ID_MAX_ATTEMPTS; attempt++) {
    const candidate = randomBytes(5).toString('hex');
    try {
      const rows = await db.query<{ exists: boolean }>(
        `select exists(select 1 from user_custom_connectors where user_id = $1 and short_id = $2) as exists`,
        [userId, candidate],
      );
      if (!rows[0]?.exists) return candidate;
    } catch (error) {
      if (isUndefinedTable(error)) return candidate;
      throw error;
    }
  }
  throw createError.internal('Could not allocate a connector identifier. Try again.');
}

async function handleGet(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
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

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
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

  let toolCount = 0;
  let capabilityCounts = {
    tools: 0,
    resources: 0,
    resourceTemplates: 0,
    prompts: 0,
    apps: 0,
  };
  let protocolEra: 'modern' | 'legacy' = 'legacy';
  let handle: Awaited<ReturnType<typeof connectMcpServer>> | undefined;
  try {
    handle = await connectMcpServer({
      egressPolicy: MCP_EGRESS_POLICY,
      serverName: name,
      config: {
        url: parsedUrl.toString(),
        transport,
        ...(authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}),
        connectionTimeoutMs: 30_000,
      },
      ...(await getMcpStatelessRuntime(
        parsedUrl.toString(),
        `user:${userId}:custom-url:${parsedUrl.toString()}`,
      )),
    });
    protocolEra = handle.protocolEra ?? 'legacy';
    toolCount = handle.catalog.tools.filter((tool) => tool.visibility !== 'app').length;
    capabilityCounts = {
      tools: toolCount,
      resources: handle.catalog.resources?.length ?? 0,
      resourceTemplates: handle.catalog.resourceTemplates?.length ?? 0,
      prompts: handle.catalog.prompts?.length ?? 0,
      apps: handle.catalog.apps?.length ?? 0,
    };
    if (Object.values(capabilityCounts).every((count) => count === 0)) {
      throw new Error('The server did not advertise any supported MCP capabilities');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ userId, name, message }, '[connectors/custom] connect-and-list failed');
    throw createError.serviceUnavailable(`Failed to connect to MCP server: ${message}`);
  } finally {
    if (handle) await Promise.resolve(handle.close()).catch(() => undefined);
  }

  const connectorToolLimit = getPlanMaxConnectorTools(planTier);
  if (connectorToolLimit !== null && toolCount > connectorToolLimit) {
    const label = getBillingPlanPricing(planTier).label;
    throw createError.validation(
      connectorToolLimit === 0
        ? `${label} plans cannot attach custom connector tools. Upgrade to add this connector.`
        : `That server exposes ${toolCount} tools, above the ${connectorToolLimit}-tool limit for ${label} plans. Upgrade to attach it.`,
    );
  }

  const now = new Date().toISOString();
  const authHeaderEnc = authToken
    ? encryptConnectorToken(authToken, 'custom-connector-auth-header')
    : null;

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

  await recordAuditEvent({
    userId,
    eventType: 'connector_added',
    request,
    detail: {
      resourceType: 'custom_mcp_connector',
      resourceId: saved.id,
      resourceName: saved.name,
      connectorId: `custom-${saved.short_id}`,
      transport: saved.transport,
      source: 'custom_mcp',
    },
  });

  return NextResponse.json(
    {
      connector: {
        id: saved.id,
        shortId: saved.short_id,
        name: saved.name,
        url: saved.url,
        transport: saved.transport,
        createdAt: saved.created_at,
        updatedAt: saved.updated_at,
      },
      toolCount,
      capabilityCounts,
      protocolEra,
    },
    { status: 201 },
  );
}

async function handleDelete(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    throw createError.validation('id query param is required');
  }

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

  for (const row of deleted) {
    await evictCustomConnectorCaches(userId, row.id);
  }

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

  for (const row of deleted) {
    await recordAuditEvent({
      userId,
      eventType: 'connector_removed',
      request,
      detail: {
        resourceType: 'custom_mcp_connector',
        resourceId: row.id,
        connectorId: `custom-${row.short_id}`,
        source: 'custom_mcp',
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
