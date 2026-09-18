import 'server-only';

import { randomBytes } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { createError } from '@/lib/errors';

/**
 * Servers an administrator publishes to a whole workspace. The row is the
 * workspace's, not the publisher's: it survives the administrator leaving, and
 * retiring one is an update so the short id the members' saved tool permissions
 * are keyed by never gets reused.
 */

export const ORG_MCP_SERVER_ID_PREFIX = 'orgmcp-';
export const MAX_ORG_MCP_SERVERS = 32;

const SHORT_ID_BYTES = 5;
const SHORT_ID_MAX_ATTEMPTS = 5;
const PG_UNIQUE_VIOLATION = '23505';

export type OrgMcpTransport = 'sse' | 'streamable-http';

export function orgMcpConnectorId(shortId: string): string {
  return `${ORG_MCP_SERVER_ID_PREFIX}${shortId}`;
}

export interface OrgMcpServerRow {
  id: string;
  short_id: string;
  name: string;
  description: string | null;
  url: string;
  transport: string;
  published: boolean;
  published_at: string | Date | null;
  retired_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface OrgMcpServer {
  id: string;
  shortId: string;
  connectorId: string;
  name: string;
  description: string | null;
  url: string;
  transport: OrgMcpTransport;
  published: boolean;
  publishedAt: string | null;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS = `id, short_id, name, description, url, transport, published, published_at,
  retired_at, created_at, updated_at`;

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toOrgMcpServer(row: OrgMcpServerRow): OrgMcpServer {
  return {
    id: row.id,
    shortId: row.short_id,
    connectorId: orgMcpConnectorId(row.short_id),
    name: row.name,
    description: row.description,
    url: row.url,
    transport: row.transport === 'sse' ? 'sse' : 'streamable-http',
    published: row.published,
    publishedAt: iso(row.published_at),
    retiredAt: iso(row.retired_at),
    createdAt: iso(row.created_at) ?? '',
    updatedAt: iso(row.updated_at) ?? '',
  };
}

export async function listOrgMcpServers(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<OrgMcpServer[]> {
  const rows = await db.query<OrgMcpServerRow>(
    `select ${COLUMNS} from public.organization_mcp_servers
      where organization_id = $1
      order by retired_at nulls first, name asc`,
    [organizationId],
  );
  return rows.map(toOrgMcpServer);
}

/** What a member's connector catalog reads: published, not retired, nothing else. */
export async function listPublishedOrgMcpServers(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<OrgMcpServer[]> {
  const rows = await db.query<OrgMcpServerRow>(
    `select ${COLUMNS} from public.organization_mcp_servers
      where organization_id = $1 and published and retired_at is null
      order by name asc`,
    [organizationId],
  );
  return rows.map(toOrgMcpServer);
}

// 'p' for published: keeps these ids out of the 0086 org-shared short-id space
// so both kinds can share the one orgmcp- server id namespace.
function shortId(): string {
  return `p${randomBytes(SHORT_ID_BYTES).toString('hex')}`;
}

function isUniqueViolation(error: unknown, fragment: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, constraint, message } = error as {
    code?: unknown;
    constraint?: unknown;
    message?: unknown;
  };
  if (code !== PG_UNIQUE_VIOLATION) return false;
  const named = typeof constraint === 'string' ? constraint : String(message ?? '');
  return named.includes(fragment);
}

export interface PublishOrgMcpServerInput {
  organizationId: string;
  name: string;
  description: string | null;
  url: string;
  transport: OrgMcpTransport;
  published: boolean;
  actorUserId: string;
}

export async function publishOrgMcpServer(
  db: DatabaseAdapter,
  input: PublishOrgMcpServerInput,
): Promise<OrgMcpServer> {
  const [count] = await db.query<{ count: string }>(
    `select count(*)::text as count from public.organization_mcp_servers
      where organization_id = $1 and retired_at is null`,
    [input.organizationId],
  );
  if (Number(count?.count ?? 0) >= MAX_ORG_MCP_SERVERS) {
    throw createError
      .validation(
        `A workspace can publish ${MAX_ORG_MCP_SERVERS} MCP servers. Retire one before adding another.`,
      )
      .asUserSafe();
  }

  for (let attempt = 0; attempt < SHORT_ID_MAX_ATTEMPTS; attempt += 1) {
    try {
      const [row] = await db.query<OrgMcpServerRow>(
        `insert into public.organization_mcp_servers
           (organization_id, short_id, name, description, url, transport, published,
            published_at, created_by_user_id, updated_by_user_id)
         values ($1, $2, $3, $4, $5, $6, $7, case when $7 then now() else null end, $8, $8)
         returning ${COLUMNS}`,
        [
          input.organizationId,
          shortId(),
          input.name,
          input.description,
          input.url,
          input.transport,
          input.published,
          input.actorUserId,
        ],
      );
      if (row) return toOrgMcpServer(row);
    } catch (error) {
      if (isUniqueViolation(error, 'url')) {
        throw createError
          .conflict('This workspace already publishes an MCP server at that URL.')
          .asUserSafe();
      }
      if (!isUniqueViolation(error, 'short_id')) throw error;
    }
  }
  throw new Error('organization_mcp_servers could not allocate a short id');
}

export interface UpdateOrgMcpServerInput {
  organizationId: string;
  serverId: string;
  published?: boolean;
  retired?: boolean;
  actorUserId: string;
}

/**
 * Publishing, unpublishing and retiring are one write, because they are one
 * decision from the administrator's side and a member sees the same list either
 * way. Retiring also unpublishes: a retired server nobody can reach must not
 * keep claiming to be offered.
 */
export async function updateOrgMcpServer(
  db: DatabaseAdapter,
  input: UpdateOrgMcpServerInput,
): Promise<OrgMcpServer | null> {
  const retired = input.retired === true;
  const published = retired ? false : (input.published ?? null);
  const [row] = await db.query<OrgMcpServerRow>(
    `update public.organization_mcp_servers
        set published = coalesce($3::boolean, published),
            published_at = case
              when coalesce($3::boolean, published) then coalesce(published_at, now())
              else null
            end,
            retired_at = case when $4::boolean then coalesce(retired_at, now()) else retired_at end,
            updated_by_user_id = $5,
            updated_at = now()
      where organization_id = $1 and id = $2
      returning ${COLUMNS}`,
    [input.organizationId, input.serverId, published, retired, input.actorUserId],
  );
  return row ? toOrgMcpServer(row) : null;
}
