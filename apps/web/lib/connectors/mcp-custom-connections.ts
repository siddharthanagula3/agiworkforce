import 'server-only';

import { randomBytes } from 'node:crypto';

import { connectMcpServer } from '@agiworkforce/mcp';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getBillingPlanPricing, getPlanMaxConnectorTools } from '@agiworkforce/types';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { MCP_EGRESS_POLICY } from '@/lib/mcp-egress-policy';
import { getMcpStatelessRuntime } from '@/lib/connectors/mcp-runtime-cache';
import { detectConnectorAuthChallenge } from '@/lib/connectors/oauth-challenge';
import {
  getCustomRemoteMcpLimit,
  getCustomRemoteMcpLimitErrorMessage,
  isUserResourceLimitError,
} from '@/lib/services/free-plan-entitlements';
import { SubscriptionService } from '@/lib/services/subscription-service';

export type CustomConnectorTransport = 'sse' | 'streamable-http';

export const CUSTOM_CONNECTOR_ID_PREFIX = 'custom-';
const SSE_PATH_SUFFIX = '/sse';
const CONNECTION_TIMEOUT_MS = 30_000;
const SHORT_ID_BYTES = 5;
const SHORT_ID_MAX_ATTEMPTS = 5;
const APP_ONLY_TOOL_VISIBILITY = 'app';
const PG_UNDEFINED_TABLE = '42P01';
const PG_UNIQUE_VIOLATION = '23505';
const SHORT_ID_CONSTRAINT_FRAGMENT = 'short_id';
const NO_CAPABILITIES_MESSAGE = 'The server did not advertise any supported MCP capabilities';
const CUSTOM_CONNECTORS_RESOURCE = 'custom_connectors';

export const CUSTOM_CONNECTORS_UNAVAILABLE_MESSAGE =
  'Custom connectors are not available in this environment';
export const SHORT_ID_ALLOCATION_FAILED_MESSAGE =
  'Could not allocate a connector identifier. Try again.';
export const DUPLICATE_URL_MESSAGE = 'You already have a custom connector for this URL.';
export const CONNECTOR_UNREACHABLE_CODE = 'CONNECTOR_UNREACHABLE';

export function customConnectorId(shortId: string): string {
  return `${CUSTOM_CONNECTOR_ID_PREFIX}${shortId}`;
}

export function transportForUrl(url: URL, requested?: unknown): CustomConnectorTransport {
  if (requested === 'sse' || requested === 'streamable-http') return requested;
  return url.pathname.endsWith(SSE_PATH_SUFFIX) ? 'sse' : 'streamable-http';
}

function pgErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  return (error as Record<string, unknown>)['code'] as string | undefined;
}

export function isUndefinedTableError(error: unknown): boolean {
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
  return typeof constraint === 'string' && constraint.includes(SHORT_ID_CONSTRAINT_FRAGMENT);
}

export interface CustomConnectorRow {
  id: string;
  short_id: string;
  name: string;
  url: string;
  transport: string;
  created_at: string;
  updated_at: string;
}

export interface CustomConnectorView {
  id: string;
  shortId: string;
  connectorId: string;
  name: string;
  url: string;
  transport: string;
  createdAt: string;
  updatedAt: string;
}

export function toCustomConnectorView(row: CustomConnectorRow): CustomConnectorView {
  return {
    id: row.id,
    shortId: row.short_id,
    connectorId: customConnectorId(row.short_id),
    name: row.name,
    url: row.url,
    transport: row.transport,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface McpCapabilityCounts {
  tools: number;
  resources: number;
  resourceTemplates: number;
  prompts: number;
  apps: number;
}

export interface McpProbeInput {
  serverName: string;
  url: string;
  transport: CustomConnectorTransport;
  headers?: Record<string, string>;
  authorizationContext: string;
}

export interface McpProbeResult {
  toolCount: number;
  toolNames: string[];
  capabilityCounts: McpCapabilityCounts;
  protocolEra: 'modern' | 'legacy';
}

export class McpProbeError extends Error {
  constructor(
    message: string,
    readonly authChallenge: boolean,
  ) {
    super(message);
    this.name = 'McpProbeError';
  }
}

export async function probeMcpServer(input: McpProbeInput): Promise<McpProbeResult> {
  let handle: Awaited<ReturnType<typeof connectMcpServer>> | undefined;
  try {
    handle = await connectMcpServer({
      egressPolicy: MCP_EGRESS_POLICY,
      serverName: input.serverName,
      config: {
        url: input.url,
        transport: input.transport,
        ...(input.headers ? { headers: input.headers } : {}),
        connectionTimeoutMs: CONNECTION_TIMEOUT_MS,
      },
      ...(await getMcpStatelessRuntime(input.url, input.authorizationContext)),
    });
    const modelTools = handle.catalog.tools.filter(
      (tool) => tool.visibility !== APP_ONLY_TOOL_VISIBILITY,
    );
    const capabilityCounts: McpCapabilityCounts = {
      tools: modelTools.length,
      resources: handle.catalog.resources?.length ?? 0,
      resourceTemplates: handle.catalog.resourceTemplates?.length ?? 0,
      prompts: handle.catalog.prompts?.length ?? 0,
      apps: handle.catalog.apps?.length ?? 0,
    };
    if (Object.values(capabilityCounts).every((count) => count === 0)) {
      throw new McpProbeError(NO_CAPABILITIES_MESSAGE, false);
    }
    return {
      toolCount: modelTools.length,
      toolNames: modelTools.map((tool) => tool.toolName),
      capabilityCounts,
      protocolEra: handle.protocolEra ?? 'legacy',
    };
  } catch (error) {
    if (error instanceof McpProbeError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      { serverName: input.serverName, message },
      '[mcp-custom-connections] connect-and-list failed',
    );
    throw new McpProbeError(message, detectConnectorAuthChallenge(error) !== null);
  } finally {
    if (handle) await Promise.resolve(handle.close()).catch(() => undefined);
  }
}

export interface CustomConnectorCapacity {
  planTier: string | null | undefined;
  connectorLimit: number | null;
}

async function countCustomConnectors(db: DatabaseAdapter, userId: string): Promise<number> {
  try {
    const rows = await db.query<{ count: string }>(
      `select count(*)::text as count from user_custom_connectors where user_id = $1`,
      [userId],
    );
    return Number(rows[0]?.count ?? '0');
  } catch (error) {
    if (isUndefinedTableError(error)) return 0;
    throw error;
  }
}

export async function assertCustomConnectorCapacity(
  db: DatabaseAdapter,
  userId: string,
): Promise<CustomConnectorCapacity> {
  const subscription = await SubscriptionService.getSubscription(db, userId);
  const planTier = subscription?.plan_tier;
  const connectorLimit = getCustomRemoteMcpLimit(planTier);
  if (connectorLimit === 0) {
    throw createError.validation(getCustomRemoteMcpLimitErrorMessage(planTier));
  }
  if (connectorLimit !== null && (await countCustomConnectors(db, userId)) >= connectorLimit) {
    throw createError.validation(getCustomRemoteMcpLimitErrorMessage(planTier));
  }
  return { planTier, connectorLimit };
}

export function assertConnectorToolCapacity(
  planTier: string | null | undefined,
  toolCount: number,
): void {
  const connectorToolLimit = getPlanMaxConnectorTools(planTier);
  if (connectorToolLimit === null || toolCount <= connectorToolLimit) return;
  const label = getBillingPlanPricing(planTier).label;
  throw createError.validation(
    connectorToolLimit === 0
      ? `${label} plans cannot attach custom connector tools. Upgrade to add this connector.`
      : `That server exposes ${toolCount} tools, above the ${connectorToolLimit}-tool limit for ${label} plans. Upgrade to attach it.`,
  );
}

async function allocateShortId(db: DatabaseAdapter, userId: string): Promise<string> {
  for (let attempt = 0; attempt < SHORT_ID_MAX_ATTEMPTS; attempt++) {
    const candidate = randomBytes(SHORT_ID_BYTES).toString('hex');
    try {
      const rows = await db.query<{ exists: boolean }>(
        `select exists(select 1 from user_custom_connectors where user_id = $1 and short_id = $2) as exists`,
        [userId, candidate],
      );
      if (!rows[0]?.exists) return candidate;
    } catch (error) {
      if (isUndefinedTableError(error)) return candidate;
      throw error;
    }
  }
  throw createError.internal(SHORT_ID_ALLOCATION_FAILED_MESSAGE);
}

export interface CustomConnectorInsert {
  userId: string;
  name: string;
  url: string;
  transport: CustomConnectorTransport;
  credentialEnc: string | null;
  connectorLimit: number | null;
}

export async function insertCustomConnector(
  db: DatabaseAdapter,
  input: CustomConnectorInsert,
): Promise<CustomConnectorRow> {
  const shortId = await allocateShortId(db, input.userId);
  const now = new Date().toISOString();
  let saved: CustomConnectorRow | undefined;
  try {
    [saved] = await db.query<CustomConnectorRow>(
      `with inserted as materialized (
         insert into user_custom_connectors
           (user_id, name, url, auth_header_enc, transport, short_id, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $7)
         returning id, short_id, name, url, transport, created_at, updated_at
       ), quota_guard as materialized (
         select public.assert_user_resource_limit('${CUSTOM_CONNECTORS_RESOURCE}', $1, $8)
           from (select count(*) from inserted) as dependency
       )
       select inserted.* from inserted cross join quota_guard`,
      [
        input.userId,
        input.name,
        input.url,
        input.credentialEnc,
        input.transport,
        shortId,
        now,
        input.connectorLimit,
      ],
    );
  } catch (error) {
    if (isUndefinedTableError(error)) {
      throw createError.serviceUnavailable(CUSTOM_CONNECTORS_UNAVAILABLE_MESSAGE);
    }
    if (isUniqueViolation(error)) {
      if (isShortIdViolation(error)) {
        throw createError.serviceUnavailable(SHORT_ID_ALLOCATION_FAILED_MESSAGE);
      }
      throw createError.conflict(DUPLICATE_URL_MESSAGE);
    }
    if (isUserResourceLimitError(error)) {
      throw createError.validation(
        getCustomRemoteMcpLimitErrorMessage(await currentPlanTier(db, input.userId)),
      );
    }
    throw error;
  }
  if (!saved) {
    logger.error(
      { userId: input.userId, name: input.name },
      '[mcp-custom-connections] insert returned no row',
    );
    throw createError.internal('Failed to save connector');
  }
  return saved;
}

async function currentPlanTier(
  db: DatabaseAdapter,
  userId: string,
): Promise<string | null | undefined> {
  return (await SubscriptionService.getSubscription(db, userId))?.plan_tier;
}

export async function updateCustomConnectorCredential(
  db: DatabaseAdapter,
  userId: string,
  rowId: string,
  credentialEnc: string,
): Promise<CustomConnectorRow | null> {
  try {
    const [row] = await db.query<CustomConnectorRow>(
      `update user_custom_connectors
          set auth_header_enc = $3, updated_at = now()
        where id = $1 and user_id = $2
        returning id, short_id, name, url, transport, created_at, updated_at`,
      [rowId, userId, credentialEnc],
    );
    return row ?? null;
  } catch (error) {
    if (isUndefinedTableError(error)) {
      throw createError.serviceUnavailable(CUSTOM_CONNECTORS_UNAVAILABLE_MESSAGE);
    }
    throw error;
  }
}

export async function deleteCustomConnectorRows(
  db: DatabaseAdapter,
  userId: string,
  rowId: string,
): Promise<Array<{ id: string; short_id: string }>> {
  try {
    return await db.query<{ id: string; short_id: string }>(
      `delete from user_custom_connectors where id = $1 and user_id = $2 returning id, short_id`,
      [rowId, userId],
    );
  } catch (error) {
    if (isUndefinedTableError(error)) {
      throw createError.serviceUnavailable(CUSTOM_CONNECTORS_UNAVAILABLE_MESSAGE);
    }
    throw error;
  }
}

export async function clearConnectorToolPermissions(
  db: DatabaseAdapter,
  userId: string,
  connectorId: string,
): Promise<void> {
  try {
    await db.execute(
      `delete from public.connector_tool_permissions where user_id = $1 and connector_id = $2`,
      [userId, connectorId],
    );
  } catch (error) {
    if (isUndefinedTableError(error)) return;
    logger.warn(
      { userId, connectorId, error },
      '[mcp-custom-connections] tool permissions could not be cleared on disconnect',
    );
  }
}
