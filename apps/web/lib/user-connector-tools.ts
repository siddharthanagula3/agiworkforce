/**
 * @file Per-user connector → chat tool-loop bridge.
 *
 * Server-only. Imported from the v1 chat-completions route to make a user's
 * CONNECTED connectors actually feed the agentic tool loop. Fixes known-flaw
 * WEB-CONNECTORS-NO-RUNTIME-EFFECT-01: before this module, `user_connectors`
 * was written by /api/connectors CRUD but never read by the tool loop, so
 * connecting a connector had zero conversational effect.
 *
 * Honest model — `user_connectors` is a per-user ENABLEMENT GATE, not a
 * credential store (it holds only connector_id + auth_type + is_active; no
 * endpoint URLs, no tokens). Credentials/endpoints therefore come from
 * server-side sources keyed by connector id, and a connector's tools are
 * offered ONLY when invoking them would actually work:
 *
 *   1. FIRST-PARTY BUILT-IN (github): backed by the existing GitHub App
 *      integration (`lib/github-app.ts` + `github_installations.access_token_enc`).
 *      Gated on the user having a usable installation — the real "invoking would
 *      work" signal — NOT on a user_connectors row (POST /api/connectors 501s
 *      github, so such a row cannot exist). The installation token is resolved
 *      per-request from the authenticated userId and is never cached across users.
 *
 *   2. REMOTE MCP CONNECTORS: an operator-provided `connectorId → MCP endpoint`
 *      map from the validated CONNECTOR_MCP_SERVERS_JSON environment value.
 *      Gated on an active `user_connectors` row for that connectorId.
 *      The endpoint + auth live in the operator config server-side; user-supplied
 *      values never flow here. Dormant until an operator configures the map.
 *
 *   3. USER'S OWN CUSTOM MCP CONNECTORS: `user_custom_connectors` rows added by
 *      the user via /api/connectors/custom (Claude.ai-style "add a remote MCP
 *      server"). Unlike sources 1–2, this table IS a real per-user credential
 *      store (url + optionally an encrypted bearer token), so — unlike the
 *      operator-mapped catalog/handle caches — nothing here is ever shared
 *      across users; the provider-facing serverId is namespaced with the
 *      row's short id, while credentialed catalog/handle caches are keyed by
 *      authenticated user id + immutable row uuid. Every tool call re-scopes
 *      to the authenticated userId before that cache can be used.
 *
 * SECURITY:
 *   - Remote endpoints pass DNS-resolution SSRF validation
 *     (assertResolvedPublicHostname) — private/link-local hosts are rejected and
 *     logged, never crash the request.
 *   - Auth material is server-side only (installation token / operator headers /
 *     the user's own encrypted bearer token, decrypted only at connect time).
 *   - Per-user tool count is capped (MAX_CONNECTOR_TOOLS_PER_USER).
 *   - Execution errors surface as tool-result errors, never as 500s.
 *   - The execution path re-validates authorization (defense-in-depth) so a model
 *     that hallucinates a connector tool the user has not connected gets an error,
 *     not a silent operator-credentialed call.
 */

import 'server-only';

import { z } from 'zod';

import {
  buildMcpToolCatalog,
  connectMcpServer,
  type McpServerConfig,
  type McpServerHandle,
  type McpToolCatalog,
} from '@agiworkforce/mcp';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { assertResolvedPublicHostname, EgressPolicyError } from '@/lib/egress-policy';
import {
  getInstallationAccessToken,
  getPrDiff,
  isGitHubAppConfigured,
  postIssueComment,
  postPrReview,
} from '@/lib/github-app';
import { decryptConnectorToken } from '@/lib/custom-connector-crypto';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';

/** Hard ceiling on connector tools injected per user, across all connectors. */
export const MAX_CONNECTOR_TOOLS_PER_USER = 32;

/** serverId reserved for the first-party GitHub built-in connector. */
const GITHUB_SERVER_ID = 'github';

/**
 * serverId prefix reserved for a user's own custom remote MCP connectors
 * (`user_custom_connectors` rows, see /api/connectors/custom). serverIds in
 * this namespace are `custom-<short_id>` — a 10-hex-char identifier (never
 * the row's full uuid `id`; see the "Why short_id" note further down) which
 * by construction never contains an underscore, so it never collides with
 * the `mcp__<serverId>__<tool>` qualified-name parser
 * (parseQualifiedToolName in lib/mcp-tool-executor.ts requires the serverId
 * segment to contain no underscore).
 */
const CUSTOM_SERVER_PREFIX = 'custom-';

const PG_UNDEFINED_TABLE = '42P01';

function isUndefinedTable(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    ((error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE ||
      String((error as Record<string, unknown>)['message'] ?? '').includes('does not exist'))
  );
}

/** Result shape returned by the connector tool executor. */
export interface ConnectorExecResult {
  /** True when this executor owns (and has attempted) the tool. */
  handled: boolean;
  content: string;
  isError: boolean;
}

const NOT_HANDLED: ConnectorExecResult = { handled: false, content: '', isError: false };

// ─── GitHub built-in connector ──────────────────────────────────────────────

interface GithubInstallationRow {
  installation_id: string | number;
  account_login: string;
}

/**
 * Static tool definitions for the GitHub built-in connector. These are only
 * ever OFFERED when the user has a usable installation (see
 * loadUserConnectorToolDefs), so their presence in a conversation already
 * proves a backing token exists.
 */
const GITHUB_TOOL_DEFS: WebMcpToolDef[] = [
  {
    qualifiedName: `mcp__${GITHUB_SERVER_ID}__get_pull_request_diff`,
    serverId: GITHUB_SERVER_ID,
    toolName: 'get_pull_request_diff',
    origin: 'connector',
    description:
      'Fetch the unified diff of a GitHub pull request in a repository the connected GitHub App installation can access.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner (user or org login).' },
        repo: { type: 'string', description: 'Repository name.' },
        pull_number: { type: 'integer', description: 'Pull request number.' },
      },
      required: ['owner', 'repo', 'pull_number'],
      additionalProperties: false,
    },
  },
  {
    qualifiedName: `mcp__${GITHUB_SERVER_ID}__post_issue_comment`,
    serverId: GITHUB_SERVER_ID,
    toolName: 'post_issue_comment',
    origin: 'connector',
    description:
      'Post a comment on a GitHub issue or pull request in a repository the connected GitHub App installation can access.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner (user or org login).' },
        repo: { type: 'string', description: 'Repository name.' },
        issue_number: {
          type: 'integer',
          description: 'Issue or pull request number to comment on.',
        },
        body: { type: 'string', description: 'Markdown body of the comment.' },
      },
      required: ['owner', 'repo', 'issue_number', 'body'],
      additionalProperties: false,
    },
  },
  {
    qualifiedName: `mcp__${GITHUB_SERVER_ID}__post_pull_request_review`,
    serverId: GITHUB_SERVER_ID,
    toolName: 'post_pull_request_review',
    origin: 'connector',
    description:
      'Post a review (comment only) on a GitHub pull request the connected GitHub App installation can access.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner (user or org login).' },
        repo: { type: 'string', description: 'Repository name.' },
        pull_number: { type: 'integer', description: 'Pull request number.' },
        body: { type: 'string', description: 'Markdown body of the review.' },
      },
      required: ['owner', 'repo', 'pull_number', 'body'],
      additionalProperties: false,
    },
  },
];

export async function getUserGithubInstallations(
  userId: string,
): Promise<{ installationId: number; login: string }[]> {
  // Minting is lazy (getInstallationAccessToken caches into access_token_enc on
  // first use), so a usable installation is any row PLUS mintable app creds —
  // requiring a cached token here would deadlock fresh installs out of ever
  // being offered.
  if (!isGitHubAppConfigured()) return [];
  const db = getNeonDb();
  let rows: GithubInstallationRow[];
  try {
    rows = await db.query<GithubInstallationRow>(
      `select installation_id, account_login
         from github_installations
        where user_id = $1
        order by created_at asc`,
      [userId],
    );
  } catch (error) {
    if (isUndefinedTable(error)) return [];
    throw error;
  }
  return rows
    .map((r) => ({ installationId: Number(r.installation_id), login: r.account_login }))
    .filter((r) => Number.isFinite(r.installationId));
}

/**
 * Resolve the installation to use for a given repo owner. Prefers an
 * installation whose account_login matches the owner (case-insensitive); falls
 * back to the sole installation when there is exactly one; otherwise returns
 * null (ambiguous — the caller surfaces a tool-result error).
 */
function resolveInstallationForOwner(
  installations: { installationId: number; login: string }[],
  owner: string,
): number | null {
  const match = installations.find((i) => i.login.toLowerCase() === owner.toLowerCase());
  if (match) return match.installationId;
  if (installations.length === 1) return installations[0]!.installationId;
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

async function executeGithubTool(
  userId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ConnectorExecResult> {
  const installations = await getUserGithubInstallations(userId);
  if (installations.length === 0) {
    // Re-validated at execution time (defense-in-depth): the tool was offered
    // only when an install existed, but never trust the offer at call time.
    return {
      handled: true,
      content: 'GitHub is not connected for this account (no usable installation).',
      isError: true,
    };
  }

  const owner = asString(args['owner']);
  const repo = asString(args['repo']);
  if (!owner || !repo) {
    return { handled: true, content: 'owner and repo are required.', isError: true };
  }

  const installationId = resolveInstallationForOwner(installations, owner);
  if (installationId === null) {
    return {
      handled: true,
      content: `No GitHub installation matches owner "${owner}". Specify a repo your GitHub App installation can access.`,
      isError: true,
    };
  }

  try {
    const token = await getInstallationAccessToken(installationId);

    if (toolName === 'get_pull_request_diff') {
      const pullNumber = asInteger(args['pull_number']);
      if (pullNumber === null) {
        return { handled: true, content: 'pull_number must be an integer.', isError: true };
      }
      const diff = await getPrDiff(token, owner, repo, pullNumber);
      return { handled: true, content: diff || '(empty diff)', isError: false };
    }

    if (toolName === 'post_issue_comment') {
      const issueNumber = asInteger(args['issue_number']);
      const body = asString(args['body']);
      if (issueNumber === null || !body) {
        return {
          handled: true,
          content: 'issue_number (integer) and body (string) are required.',
          isError: true,
        };
      }
      await postIssueComment(token, owner, repo, issueNumber, body);
      return {
        handled: true,
        content: `Posted comment on ${owner}/${repo}#${issueNumber}.`,
        isError: false,
      };
    }

    if (toolName === 'post_pull_request_review') {
      const pullNumber = asInteger(args['pull_number']);
      const body = asString(args['body']);
      if (pullNumber === null || !body) {
        return {
          handled: true,
          content: 'pull_number (integer) and body (string) are required.',
          isError: true,
        };
      }
      await postPrReview(token, owner, repo, pullNumber, body, 'COMMENT');
      return {
        handled: true,
        content: `Posted review on ${owner}/${repo}#${pullNumber}.`,
        isError: false,
      };
    }

    return { handled: true, content: `Unknown GitHub tool: ${toolName}`, isError: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ userId, toolName, error: msg }, '[user-connector] github tool execution failed');
    return { handled: true, content: `GitHub tool error: ${msg}`, isError: true };
  }
}

// ─── Remote MCP connectors (operator-configured, per-user gated) ─────────────

const remoteConnectorEntrySchema = z.object({
  connectorId: z.string().min(1).max(100),
  url: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === 'https:', 'MCP endpoint must use HTTPS'),
  headers: z.record(z.string(), z.string()).optional().default({}),
  enabled: z.boolean().optional().default(true),
});

const remoteConnectorFileSchema = z.object({
  connectors: z.array(remoteConnectorEntrySchema),
});

type RemoteConnectorEntry = z.infer<typeof remoteConnectorEntrySchema>;

let _mapCache: Map<string, RemoteConnectorEntry> | null = null;

/**
 * Load the operator connector→MCP map. Reserved built-in ids (github) are
 * ignored if an operator tries to redefine them. Cached for the process
 * lifetime; returns an empty map when the environment value is absent.
 */
function loadConnectorMcpMap(): Map<string, RemoteConnectorEntry> {
  if (_mapCache !== null) return _mapCache;

  const map = new Map<string, RemoteConnectorEntry>();
  const inline = process.env['CONNECTOR_MCP_SERVERS_JSON'];

  try {
    const raw: unknown = inline ? JSON.parse(inline) : null;
    if (raw) {
      const parsed = remoteConnectorFileSchema.parse(raw);
      for (const entry of parsed.connectors) {
        if (!entry.enabled) continue;
        if (entry.connectorId === GITHUB_SERVER_ID) continue; // reserved built-in
        if (entry.connectorId.startsWith(CUSTOM_SERVER_PREFIX)) continue; // reserved for per-user custom connectors
        map.set(entry.connectorId, entry);
      }
      logger.info({ count: map.size }, '[user-connector] loaded operator connector MCP map');
    }
  } catch (err) {
    logger.error({ error: err }, '[user-connector] failed to parse connector MCP map — ignoring');
  }

  _mapCache = map;
  return map;
}

/** TEST-ONLY: reset the cached connector map so env changes take effect. */
export function __resetConnectorMcpMapCacheForTests(): void {
  _mapCache = null;
}

/**
 * Connector ids the operator has mapped to remote MCP endpoints (enabled
 * entries only). /api/connectors uses this to decide which non-local
 * connectors can honestly be enabled: a user_connectors row only has runtime
 * effect for ids in this map (the github built-in is gated on installations
 * instead).
 */
export function getOperatorMappedConnectorIds(): Set<string> {
  return new Set(loadConnectorMcpMap().keys());
}

function entryToMcpConfig(entry: RemoteConnectorEntry): McpServerConfig {
  return {
    url: entry.url,
    transport: 'streamable-http',
    headers: entry.headers,
  };
}

async function getUserActiveConnectorIds(userId: string): Promise<Set<string>> {
  const db = getNeonDb();
  try {
    const rows = await db.query<{ connector_id: string }>(
      `select connector_id from user_connectors where user_id = $1 and is_active = true`,
      [userId],
    );
    return new Set(rows.map((r) => r.connector_id));
  } catch (error) {
    if (isUndefinedTable(error)) return new Set();
    throw error;
  }
}

// Per-connectorId catalog cache. The catalog is operator-credentialed and
// therefore user-independent, so it is safe to share across users; per-user
// gating happens at def-assembly time via getUserActiveConnectorIds.
interface RemoteCatalogState {
  catalog: McpToolCatalog | null;
  expiresAt: number;
}
const _remoteCatalogCache = new Map<string, RemoteCatalogState>();
const REMOTE_CATALOG_TTL_MS = 60_000;

// Execution handle cache (operator-credentialed, user-independent).
const _remoteHandles = new Map<string, McpServerHandle>();

async function buildRemoteConnectorCatalog(
  entry: RemoteConnectorEntry,
): Promise<McpToolCatalog | null> {
  const now = Date.now();
  const cached = _remoteCatalogCache.get(entry.connectorId);
  if (cached && cached.catalog && now < cached.expiresAt) return cached.catalog;

  // SSRF: reject private/link-local endpoints (DNS-resolution check).
  try {
    await assertResolvedPublicHostname(entry.url);
  } catch (err) {
    if (err instanceof EgressPolicyError) {
      logger.warn(
        { connectorId: entry.connectorId },
        '[user-connector] remote connector endpoint blocked by SSRF policy',
      );
      _remoteCatalogCache.set(entry.connectorId, {
        catalog: null,
        expiresAt: now + REMOTE_CATALOG_TTL_MS,
      });
      return null;
    }
    throw err;
  }

  try {
    const { catalog, handles } = await buildMcpToolCatalog({
      [entry.connectorId]: entryToMcpConfig(entry),
    });
    // Refresh the execution handle cache with the freshly-connected handle.
    for (const h of handles) {
      const old = _remoteHandles.get(h.serverName);
      _remoteHandles.set(h.serverName, h);
      if (old && old !== h) await old.close().catch(() => undefined);
    }
    _remoteCatalogCache.set(entry.connectorId, {
      catalog,
      expiresAt: now + REMOTE_CATALOG_TTL_MS,
    });
    return catalog;
  } catch (err) {
    logger.warn(
      { connectorId: entry.connectorId, error: err instanceof Error ? err.message : err },
      '[user-connector] failed to build remote connector catalog',
    );
    _remoteCatalogCache.set(entry.connectorId, {
      catalog: null,
      expiresAt: now + REMOTE_CATALOG_TTL_MS,
    });
    return null;
  }
}

function catalogToConnectorToolDefs(
  catalog: McpToolCatalog,
  serverLabel?: string,
): WebMcpToolDef[] {
  return catalog.tools.map((t) => ({
    qualifiedName: `mcp__${t.serverName}__${t.toolName}`,
    serverId: t.serverName,
    toolName: t.toolName,
    description: t.description ?? t.fallbackDescription,
    origin: 'connector',
    // Only custom connectors have an opaque `custom-<hex>` serverId with no
    // human name; pass the row's display name so the activity feed reads
    // "Using <name> connector" instead of leaking the id.
    ...(serverLabel ? { serverLabel } : {}),
    inputSchema: t.inputSchema,
  }));
}

async function executeRemoteConnectorTool(
  entry: RemoteConnectorEntry,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ConnectorExecResult> {
  try {
    let handle = _remoteHandles.get(entry.connectorId);
    if (!handle) {
      // SSRF re-check before establishing a fresh connection.
      await assertResolvedPublicHostname(entry.url);
      handle = await connectMcpServer({
        serverName: entry.connectorId,
        config: entryToMcpConfig(entry),
      });
      _remoteHandles.set(entry.connectorId, handle);
    }
    const result = await handle.callTool(toolName, args);
    const text = result.content
      .map((block) => {
        if (block.type === 'text') return block.text;
        if (block.type === 'resource')
          return block.resource.text ?? `[resource: ${block.resource.uri}]`;
        if (block.type === 'image') return '[image result]';
        return '';
      })
      .filter(Boolean)
      .join('\n');
    return { handled: true, content: text || '(no output)', isError: result.isError === true };
  } catch (err) {
    if (err instanceof EgressPolicyError) {
      logger.warn(
        { connectorId: entry.connectorId },
        '[user-connector] remote connector endpoint blocked by SSRF policy at execution',
      );
      return {
        handled: true,
        content: 'Connector endpoint blocked by security policy.',
        isError: true,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { connectorId: entry.connectorId, toolName, error: msg },
      '[user-connector] remote connector tool execution failed',
    );
    return { handled: true, content: `Connector tool error: ${msg}`, isError: true };
  }
}

// ─── User's own custom remote MCP connectors (per-user credentialed) ───────
//
// Unlike the operator-mapped remote connectors above (operator-credentialed,
// safe to share a catalog/handle across users), rows here belong to exactly
// one user (RLS-enforced in Postgres) and carry that user's OWN, possibly
// secret, bearer token. The catalog/handle caches below are therefore keyed
// by authenticated `user_id` + immutable row uuid (never by the user-scoped
// `short_id` alone), and every lookup re-scopes by `user_id` at read time so a
// guessed identifier can never reach another user's connector.
//
// Why `short_id` and not the row's `id` (uuid)? The serverId namespace below
// is embedded verbatim in the provider-facing function name
// (`mcp__custom-<X>__<toolName>` — see catalogToConnectorToolDefs), and
// OpenAI-family providers cap function names at 64 chars. A 36-char uuid
// would alone burn 50 of those before the tool name even starts. `short_id`
// is a 10-hex-char identifier allocated at insert time
// (app/api/connectors/custom/route.ts's allocateShortId), unique per
// (user_id, short_id) at the DB level.

interface CustomConnectorRow {
  id: string;
  short_id: string;
  name: string;
  url: string;
  transport: string;
  auth_header_enc: string | null;
}

function customServerId(shortId: string): string {
  return `${CUSTOM_SERVER_PREFIX}${shortId}`;
}

function customShortIdFromServerId(serverId: string): string | null {
  return serverId.startsWith(CUSTOM_SERVER_PREFIX)
    ? serverId.slice(CUSTOM_SERVER_PREFIX.length)
    : null;
}

async function getUserCustomConnectorRows(
  userId: string,
  limit?: number,
): Promise<CustomConnectorRow[]> {
  const db = getNeonDb();
  try {
    const rows = await db.query<CustomConnectorRow>(
      `select id, short_id, name, url, transport, auth_header_enc
         from user_custom_connectors
        where user_id = $1
        order by created_at asc, id asc
        limit $2`,
      [userId, limit ?? null],
    );
    return limit === undefined ? rows : rows.slice(0, limit);
  } catch (error) {
    if (isUndefinedTable(error)) return [];
    throw error;
  }
}

/** Auth-material-free view of a user's custom connectors, for API responses
 * (/api/connectors, /api/connectors/custom) — never includes auth_header_enc. */
export interface UserCustomConnectorSummary {
  /** Row uuid — the list/DELETE key. */
  id: string;
  /**
   * 10-hex chat-facing id: the tool loop's serverId is `custom-<shortId>`
   * (see the "why short_id" note above — a uuid would overflow OpenAI's
   * 64-char function-name cap). API responses expose this so clients can
   * correlate a directory row with the tool calls it produces in chat.
   */
  shortId: string;
  name: string;
  url: string;
  transport: string;
  createdAt: string;
  updatedAt: string;
}

export async function getUserCustomConnectorSummaries(
  userId: string,
): Promise<UserCustomConnectorSummary[]> {
  const db = getNeonDb();
  try {
    const rows = await db.query<{
      id: string;
      short_id: string;
      name: string;
      url: string;
      transport: string;
      created_at: string;
      updated_at: string;
    }>(
      `select id, short_id, name, url, transport, created_at, updated_at
         from user_custom_connectors
        where user_id = $1
        order by created_at desc`,
      [userId],
    );
    return rows.map((r) => ({
      id: r.id,
      shortId: r.short_id,
      name: r.name,
      url: r.url,
      transport: r.transport,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  } catch (error) {
    if (isUndefinedTable(error)) return [];
    throw error;
  }
}

/**
 * Raised when a stored custom-connector credential exists but cannot be
 * decrypted. Distinct from a transport failure so callers can tell the user to
 * reconnect rather than reporting a generic connector error.
 */
export class ConnectorCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectorCredentialError';
  }
}

function customRowToMcpConfig(row: CustomConnectorRow): McpServerConfig {
  const headers: Record<string, string> = {};
  if (row.auth_header_enc) {
    // AUDIT-FIX CON-13: fail closed. Previously a decryption failure was logged
    // and the connection proceeded with an empty header set — silently
    // downgrading an authenticated connector to an anonymous one. If the remote
    // server treats unauthenticated callers as a public or lower-privileged
    // principal, the user gets a different (possibly another tenant's) view of
    // the data with no indication anything changed.
    try {
      headers['Authorization'] = `Bearer ${decryptConnectorToken(row.auth_header_enc)}`;
    } catch (err) {
      logger.warn(
        { rowId: row.id, error: err instanceof Error ? err.message : err },
        '[user-connector] failed to decrypt custom connector token — refusing to connect',
      );
      throw new ConnectorCredentialError(
        'Stored credentials for this connector could not be decrypted. Reconnect the connector to continue.',
      );
    }
  }
  return {
    url: row.url,
    transport: row.transport === 'sse' ? 'sse' : 'streamable-http',
    headers,
  };
}

// Per-row catalog cache. Keyed by row id (already 1:1 with a single user's
// credentials), TTL matches the operator remote-connector cache. The authenticated
// user id remains part of the key as defense-in-depth against row-id/key mistakes.
interface CustomCatalogState {
  catalog: McpToolCatalog | null;
  expiresAt: number;
}
const _customCatalogCache = new Map<string, CustomCatalogState>();
const CUSTOM_CATALOG_TTL_MS = 60_000;

// Execution handle cache. Per-row — NEVER shared across users.
const _customHandles = new Map<string, McpServerHandle>();

function customConnectorCacheKey(userId: string, rowId: string): string {
  return `${encodeURIComponent(userId)}:${encodeURIComponent(rowId)}`;
}

/**
 * Evict the cached catalog and close the open MCP handle for a deleted custom
 * connector, so the connection is released immediately instead of leaking
 * until process restart. Safe no-op for unknown ids. Called by the custom
 * connectors DELETE route; the execute path re-validates ownership in the DB
 * on every call, so this is resource hygiene, not a security gate.
 */
export async function evictCustomConnectorCaches(userId: string, rowId: string): Promise<void> {
  const cacheKey = customConnectorCacheKey(userId, rowId);
  _customCatalogCache.delete(cacheKey);
  const handle = _customHandles.get(cacheKey);
  if (handle) {
    _customHandles.delete(cacheKey);
    await handle.close().catch(() => undefined);
  }
}

async function buildCustomConnectorCatalog(
  userId: string,
  row: CustomConnectorRow,
): Promise<McpToolCatalog | null> {
  const now = Date.now();
  const cacheKey = customConnectorCacheKey(userId, row.id);
  const cached = _customCatalogCache.get(cacheKey);
  if (cached && cached.catalog && now < cached.expiresAt) return cached.catalog;

  // SSRF: reject private/link-local endpoints (DNS-resolution check). A
  // connector saved when the endpoint was public could still be repointed
  // via DNS since save time, so re-check on every catalog build.
  try {
    await assertResolvedPublicHostname(row.url);
  } catch (err) {
    if (err instanceof EgressPolicyError) {
      logger.warn(
        { rowId: row.id },
        '[user-connector] custom connector endpoint blocked by SSRF policy',
      );
      _customCatalogCache.set(cacheKey, {
        catalog: null,
        expiresAt: now + CUSTOM_CATALOG_TTL_MS,
      });
      return null;
    }
    throw err;
  }

  const serverId = customServerId(row.short_id);
  try {
    const { catalog, handles } = await buildMcpToolCatalog({
      [serverId]: customRowToMcpConfig(row),
    });
    for (const h of handles) {
      const old = _customHandles.get(cacheKey);
      _customHandles.set(cacheKey, h);
      if (old && old !== h) await old.close().catch(() => undefined);
    }
    _customCatalogCache.set(cacheKey, { catalog, expiresAt: now + CUSTOM_CATALOG_TTL_MS });
    return catalog;
  } catch (err) {
    logger.warn(
      { rowId: row.id, error: err instanceof Error ? err.message : err },
      '[user-connector] failed to build custom connector catalog',
    );
    _customCatalogCache.set(cacheKey, {
      catalog: null,
      expiresAt: now + CUSTOM_CATALOG_TTL_MS,
    });
    return null;
  }
}

async function executeCustomConnectorTool(
  userId: string,
  shortId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ConnectorExecResult> {
  // Re-validate ownership at execution time (defense-in-depth, mirrors the
  // remote-connector re-check): only ever act on a row owned by this user.
  const db = getNeonDb();
  let rows: CustomConnectorRow[];
  try {
    rows = await db.query<CustomConnectorRow>(
      `select id, short_id, name, url, transport, auth_header_enc
         from user_custom_connectors
        where short_id = $1 and user_id = $2`,
      [shortId, userId],
    );
  } catch (error) {
    if (isUndefinedTable(error)) rows = [];
    else throw error;
  }
  const row = rows[0];
  if (!row) {
    return {
      handled: true,
      content: 'This custom connector is no longer connected for this account.',
      isError: true,
    };
  }

  try {
    const cacheKey = customConnectorCacheKey(userId, row.id);
    let handle = _customHandles.get(cacheKey);
    if (!handle) {
      await assertResolvedPublicHostname(row.url);
      handle = await connectMcpServer({
        serverName: customServerId(row.short_id),
        config: customRowToMcpConfig(row),
      });
      _customHandles.set(cacheKey, handle);
    }
    const result = await handle.callTool(toolName, args);
    const text = result.content
      .map((block) => {
        if (block.type === 'text') return block.text;
        if (block.type === 'resource')
          return block.resource.text ?? `[resource: ${block.resource.uri}]`;
        if (block.type === 'image') return '[image result]';
        return '';
      })
      .filter(Boolean)
      .join('\n');
    return { handled: true, content: text || '(no output)', isError: result.isError === true };
  } catch (err) {
    if (err instanceof EgressPolicyError) {
      logger.warn(
        { rowId: row.id },
        '[user-connector] custom connector endpoint blocked by SSRF policy at execution',
      );
      return {
        handled: true,
        content: 'Connector endpoint blocked by security policy.',
        isError: true,
      };
    }
    if (err instanceof ConnectorCredentialError) {
      return { handled: true, content: err.message, isError: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { rowId: row.id, toolName, error: msg },
      '[user-connector] custom connector tool execution failed',
    );
    return { handled: true, content: `Connector tool error: ${msg}`, isError: true };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Assemble the tool defs contributed by a signed-in user's connected connectors.
 * Fully defensive: any failure degrades to an empty list (never throws), so a
 * missing table / unconfigured map / DB hiccup can never break a chat request.
 */
export async function loadUserConnectorToolDefs(
  userId: string,
  options: { customConnectorLimit?: number } = {},
): Promise<WebMcpToolDef[]> {
  if (!userId) return [];
  try {
    const defs: WebMcpToolDef[] = [];

    // 1. First-party GitHub built-in (live when the user has an installation).
    const installations = await getUserGithubInstallations(userId);
    if (installations.length > 0) {
      defs.push(...GITHUB_TOOL_DEFS);
    }

    // 2. Remote MCP connectors (operator-configured, gated by user_connectors).
    const map = loadConnectorMcpMap();
    if (map.size > 0) {
      const activeIds = await getUserActiveConnectorIds(userId);
      const connectedEntries = [...map.values()].filter((e) => activeIds.has(e.connectorId));
      for (const entry of connectedEntries) {
        const catalog = await buildRemoteConnectorCatalog(entry);
        if (catalog) defs.push(...catalogToConnectorToolDefs(catalog));
      }
    }

    // 3. The user's own custom remote MCP connectors (per-user credentialed,
    // persisted via /api/connectors/custom). Each row independently degrades
    // to no tools on failure (buildCustomConnectorCatalog never throws).
    const customConnectorLimit =
      options.customConnectorLimit === undefined
        ? undefined
        : Math.max(0, Math.floor(options.customConnectorLimit));
    const customRows = await getUserCustomConnectorRows(userId, customConnectorLimit);
    for (const row of customRows) {
      const catalog = await buildCustomConnectorCatalog(userId, row);
      if (catalog) defs.push(...catalogToConnectorToolDefs(catalog, row.name));
    }

    if (defs.length > MAX_CONNECTOR_TOOLS_PER_USER) {
      logger.info(
        { userId, total: defs.length, cap: MAX_CONNECTOR_TOOLS_PER_USER },
        '[user-connector] capping per-user connector tools',
      );
      return defs.slice(0, MAX_CONNECTOR_TOOLS_PER_USER);
    }
    return defs;
  } catch (err) {
    logger.warn(
      { userId, error: err instanceof Error ? err.message : err },
      '[user-connector] failed to assemble connector tools — proceeding without them',
    );
    return [];
  }
}

/**
 * Build a per-user connector tool executor bound to `userId`. The tool loop
 * calls it before the operator MCP dispatch: it returns `handled: true` for
 * connector-owned tools (github built-in / operator-mapped remote connectors /
 * the user's own custom remote MCP connectors) and `handled: false` for
 * anything else so the caller falls through to the operator MCP executor.
 * Authorization is re-validated per call.
 */
export function makeUserConnectorExecutor(
  userId: string,
): (
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
) => Promise<ConnectorExecResult> {
  return async (serverId, toolName, args) => {
    if (!userId) return NOT_HANDLED;

    if (serverId === GITHUB_SERVER_ID) {
      return executeGithubTool(userId, toolName, args);
    }

    const customShortId = customShortIdFromServerId(serverId);
    if (customShortId !== null) {
      return executeCustomConnectorTool(userId, customShortId, toolName, args);
    }

    const map = loadConnectorMcpMap();
    const entry = map.get(serverId);
    if (!entry) return NOT_HANDLED;

    // Re-validate the per-user gate: the user must still have this connector
    // active. Never execute an operator-credentialed connector for a user who
    // has not connected it.
    const activeIds = await getUserActiveConnectorIds(userId);
    if (!activeIds.has(serverId)) {
      return {
        handled: true,
        content: `Connector "${serverId}" is not connected for this account.`,
        isError: true,
      };
    }

    return executeRemoteConnectorTool(entry, toolName, args);
  };
}
