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
 *   2b. PER-USER OAUTH CONNECTORS (migration 0097 + `lib/connectors/**`): a
 *      provider the OPERATOR registered an OAuth application for
 *      (`CONNECTOR_OAUTH_PROVIDERS_JSON` + per-provider client credentials).
 *      The platform runs the authorization-code + PKCE dance, and each user's
 *      tokens are stored encrypted in `connector_oauth_grants`. Gated on that
 *      user holding a live grant — the real "invoking would work" signal — so
 *      no `user_connectors` row is involved. Dormant until an operator
 *      registers at least one OAuth app.
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
 *   - Per-user tool count is capped per plan (GOV-7, getPlanMaxConnectorTools,
 *     falling back to MAX_CONNECTOR_TOOLS_PER_USER when the tier declares none).
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
  type McpCallToolResult,
  type McpServerConfig,
  type McpServerHandle,
  type McpToolCatalog,
} from '@agiworkforce/mcp';

import { getNeonDb } from '@/lib/server/neon-db';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';
import { logger } from '@/lib/logger';
import { assertResolvedPublicHostname, EgressPolicyError } from '@/lib/egress-policy';
import {
  getInstallationAccessToken,
  getPrDiff,
  isGitHubAppConfigured,
  isGitHubInstallationLinkingAvailable,
  postIssueComment,
  postPrReview,
} from '@/lib/github-app';
import { decryptConnectorToken } from '@/lib/custom-connector-crypto';
import {
  getConnectorOAuthProvider,
  getOAuthConfiguredConnectorIds,
  type ConnectorOAuthProvider,
} from '@/lib/connectors/oauth-registry';
import { resolveConnectorAccessToken } from '@/lib/connectors/oauth-access';
import { getUserConnectorOAuthGrantSummaries } from '@/lib/connectors/oauth-store';
import { detectConnectorAuthChallenge } from '@/lib/connectors/oauth-challenge';
import {
  buildConnectorAuthorizationRequiredPayload,
  serializeConnectorAuthorizationRequired,
  type ConnectorAuthorizationReason,
} from '@/lib/connectors/connect-required';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import { getBillingPlanProductLimits, getPlanMaxConnectorTools } from '@agiworkforce/types';

/**
 * GOV-7: fallback ceiling on connector tools injected per user, across all
 * connectors, used only when the billing catalog declares no per-plan limit
 * for the caller's tier (or no tier is known). The per-plan ceiling from
 * `getPlanMaxConnectorTools` takes precedence — this flat number used to be
 * the ONLY cap, so every tier from free to enterprise silently truncated at
 * the same 32 and a paid plan bought no extra connector capacity.
 */
export const MAX_CONNECTOR_TOOLS_PER_USER = 32;

/**
 * GOV-7: one connector that lost tools to the per-plan ceiling.
 *
 * Truncation used to be log-only: tools were dropped server-side while the
 * connector still read "Connected" in the UI, so the model simply could not
 * call them and the user had no way to find out why. Returning the drop makes
 * it something a caller can actually tell the user about.
 */
export interface DroppedConnectorTools {
  /** MCP serverId of the connector that lost tools. */
  connectorId: string;
  /** Human label when the serverId is an opaque `custom-<hex>` id. */
  connectorLabel: string;
  /** How many of this connector's tools were not offered this turn. */
  droppedToolCount: number;
}

/** GOV-7: the full result of assembling a user's connector tool catalog. */
export interface UserConnectorToolCatalog {
  /** The tools actually offered to the model this turn. */
  tools: WebMcpToolDef[];
  /** Non-empty only when the per-plan ceiling truncated the catalog. */
  dropped: DroppedConnectorTools[];
  /** The ceiling that was applied, or null when the plan declares none. */
  limit: number | null;
}

/**
 * GOV-7 — resolve the connector-tool ceiling for `planTier`.
 *
 * `getPlanMaxConnectorTools` returns null for BOTH 'unlimited' and 'custom',
 * which for a recognised tier means "no product-side ceiling" — collapsing
 * that onto the flat 32 would have capped enterprise below pro. The flat
 * fallback therefore applies only when the tier is absent or unrecognised,
 * where refusing to cap at all would be the unsafe answer.
 */
function resolveConnectorToolLimit(planTier: string | null | undefined): number | null {
  if (!getBillingPlanProductLimits(planTier)) return MAX_CONNECTOR_TOOLS_PER_USER;
  return getPlanMaxConnectorTools(planTier);
}

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
  if (!isGitHubInstallationLinkingAvailable() || !isGitHubAppConfigured()) return [];
  const db = getNeonDb();
  let rows: GithubInstallationRow[];
  try {
    rows = await db.query<GithubInstallationRow>(
      `select installation_id, account_login
         from github_installations
        where user_id = $1
          and ownership_verified_at is not null
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
        if (entry.connectorId.startsWith(ORG_SHARED_SERVER_PREFIX)) continue; // reserved for org-shared connectors (0086)
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

/** Flatten an MCP result's content blocks into the tool-loop's text payload. */
function mcpResultToText(result: { content: McpCallToolResult['content'] }): string {
  return result.content
    .map((block) => {
      if (block.type === 'text') return block.text;
      if (block.type === 'resource')
        return block.resource.text ?? `[resource: ${block.resource.uri}]`;
      if (block.type === 'image') return '[image result]';
      return '';
    })
    .filter(Boolean)
    .join('\n');
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
    const text = mcpResultToText(result);
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
    // An authorization challenge on an OPERATOR-credentialed connector is not
    // something the user can fix by reconnecting, so it must not produce a
    // Connect card. Say what actually happened instead of a bare transport
    // error, and drop the handle so a re-credentialed operator config is picked
    // up without a process restart.
    const challenge = detectConnectorAuthChallenge(err);
    if (challenge) {
      const stale = _remoteHandles.get(entry.connectorId);
      if (stale) {
        _remoteHandles.delete(entry.connectorId);
        await stale.close().catch(() => undefined);
      }
      _remoteCatalogCache.delete(entry.connectorId);
      logger.warn(
        { connectorId: entry.connectorId, toolName, status: challenge.status },
        '[user-connector] remote connector rejected the operator credentials',
      );
      return {
        handled: true,
        content: `Connector "${entry.connectorId}" rejected this deployment's credentials (HTTP ${challenge.status}). The operator must update the connector configuration; reconnecting will not help.`,
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
    const text = mcpResultToText(result);
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
    // A custom connector's credential is a bearer token the USER supplied —
    // there is no broker that can refresh it — so an authorization challenge
    // means "your saved token no longer works", not "click Connect".
    const challenge = detectConnectorAuthChallenge(err);
    if (challenge) {
      await evictCustomConnectorCaches(userId, row.id);
      logger.warn(
        { rowId: row.id, toolName, status: challenge.status },
        '[user-connector] custom connector rejected the stored credential',
      );
      return {
        handled: true,
        content: `${row.name} rejected the saved credential (HTTP ${challenge.status}). Ask the user to update this connector's token in Settings > Connectors, then try again.`,
        isError: true,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { rowId: row.id, toolName, error: msg },
      '[user-connector] custom connector tool execution failed',
    );
    return { handled: true, content: `Connector tool error: ${msg}`, isError: true };
  }
}

// ─── Per-user OAuth connectors (migration 0097, lib/connectors/**) ──────────
//
// The Anthropic-style directory connector: the OPERATOR registers one OAuth
// application per provider, the USER clicks Connect, and the platform holds
// that user's tokens. Unlike the operator-mapped remote connectors above, the
// credential is per-user, so catalog and handle caches here are keyed by
// authenticated user id + connector id and are NEVER shared across users — the
// same rule the custom-connector path follows.
//
// The connector id doubles as the MCP serverId (the registry rejects ids with
// an underscore, so `mcp__<serverId>__<tool>` still parses) and as the
// `connector_tool_permissions.connector_id`, so the user's per-tool
// allow/ask/deny verdicts apply to these connectors with no extra wiring.

function oauthConnectorCacheKey(userId: string, connectorId: string): string {
  return `${encodeURIComponent(userId)}:${encodeURIComponent(connectorId)}`;
}

const _oauthCatalogCache = new Map<string, CustomCatalogState>();
const _oauthHandles = new Map<string, McpServerHandle>();
const OAUTH_CATALOG_TTL_MS = 60_000;

function oauthConnectorMcpConfig(
  provider: ConnectorOAuthProvider,
  accessToken: string,
  tokenType: string,
): McpServerConfig {
  return {
    url: provider.mcpUrl,
    transport: provider.transport,
    headers: { Authorization: `${tokenType || 'Bearer'} ${accessToken}` },
  };
}

/**
 * Release the cached catalog and close the open handle for an OAuth connector.
 * Called on disconnect and whenever a token is refreshed — a live handle holds
 * the OLD Authorization header, so reusing it after a refresh would keep
 * replaying the rejected credential.
 */
export async function evictConnectorOAuthCaches(
  userId: string,
  connectorId: string,
): Promise<void> {
  const cacheKey = oauthConnectorCacheKey(userId, connectorId);
  _oauthCatalogCache.delete(cacheKey);
  const handle = _oauthHandles.get(cacheKey);
  if (handle) {
    _oauthHandles.delete(cacheKey);
    await handle.close().catch(() => undefined);
  }
}

function connectRequiredResult(params: {
  connectorId: string;
  toolName: string;
  reason: ConnectorAuthorizationReason;
  additionalScopes?: string[];
}): ConnectorExecResult {
  const payload = buildConnectorAuthorizationRequiredPayload({
    connectorId: params.connectorId,
    toolName: params.toolName,
    reason: params.reason,
    ...(params.additionalScopes ? { additionalScopes: params.additionalScopes } : {}),
  });
  return {
    handled: true,
    content: serializeConnectorAuthorizationRequired(payload),
    isError: true,
  };
}

/**
 * Connector ids that are OAuth-configured AND not already claimed by the
 * operator MCP map. The operator's static mapping wins for a duplicated id:
 * it is already working today, and silently swapping it for a per-user OAuth
 * credential would change who a running deployment calls the provider as.
 */
const _reportedOAuthShadowedIds = new Set<string>();

function getUsableOAuthConnectorIds(): string[] {
  const operatorMapped = loadConnectorMcpMap();
  const usable: string[] = [];
  for (const id of getOAuthConfiguredConnectorIds()) {
    if (operatorMapped.has(id)) {
      // A configuration mistake, not a per-turn event: warn once per process
      // rather than on every chat turn for the life of the deployment.
      if (!_reportedOAuthShadowedIds.has(id)) {
        _reportedOAuthShadowedIds.add(id);
        logger.warn(
          { connectorId: id },
          '[user-connector] connector id is both operator-mapped and OAuth-configured; keeping the operator mapping',
        );
      }
      continue;
    }
    usable.push(id);
  }
  return usable;
}

async function buildOAuthConnectorCatalog(
  userId: string,
  provider: ConnectorOAuthProvider,
  accessToken: string,
  tokenType: string,
): Promise<McpToolCatalog | null> {
  const now = Date.now();
  const cacheKey = oauthConnectorCacheKey(userId, provider.connectorId);
  const cached = _oauthCatalogCache.get(cacheKey);
  if (cached && cached.catalog && now < cached.expiresAt) return cached.catalog;

  // SSRF: the MCP endpoint is operator-supplied but can still be re-pointed via
  // DNS after configuration, so it is re-checked on every build.
  try {
    await assertResolvedPublicHostname(provider.mcpUrl);
  } catch (err) {
    if (err instanceof EgressPolicyError) {
      logger.warn(
        { connectorId: provider.connectorId },
        '[user-connector] OAuth connector endpoint blocked by SSRF policy',
      );
      _oauthCatalogCache.set(cacheKey, { catalog: null, expiresAt: now + OAUTH_CATALOG_TTL_MS });
      return null;
    }
    throw err;
  }

  try {
    const { catalog, handles } = await buildMcpToolCatalog({
      [provider.connectorId]: oauthConnectorMcpConfig(provider, accessToken, tokenType),
    });
    for (const h of handles) {
      const old = _oauthHandles.get(cacheKey);
      _oauthHandles.set(cacheKey, h);
      if (old && old !== h) await old.close().catch(() => undefined);
    }
    _oauthCatalogCache.set(cacheKey, { catalog, expiresAt: now + OAUTH_CATALOG_TTL_MS });
    return catalog;
  } catch (err) {
    logger.warn(
      {
        connectorId: provider.connectorId,
        authChallenge: detectConnectorAuthChallenge(err) !== null,
      },
      '[user-connector] failed to build OAuth connector catalog',
    );
    _oauthCatalogCache.set(cacheKey, { catalog: null, expiresAt: now + OAUTH_CATALOG_TTL_MS });
    return null;
  }
}

async function callOAuthConnectorTool(
  userId: string,
  provider: ConnectorOAuthProvider,
  accessToken: string,
  tokenType: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ConnectorExecResult> {
  const cacheKey = oauthConnectorCacheKey(userId, provider.connectorId);
  let handle = _oauthHandles.get(cacheKey);
  if (!handle) {
    await assertResolvedPublicHostname(provider.mcpUrl);
    handle = await connectMcpServer({
      serverName: provider.connectorId,
      config: oauthConnectorMcpConfig(provider, accessToken, tokenType),
    });
    _oauthHandles.set(cacheKey, handle);
  }
  const result = await handle.callTool(toolName, args);
  return {
    handled: true,
    content: mcpResultToText(result) || '(no output)',
    isError: result.isError === true,
  };
}

/**
 * LAZY AUTHENTICATION — the 401 flow.
 *
 * A tool call that hits an authorization challenge does not fail the turn. It
 * becomes a structured "connect required" result the client renders as an
 * inline Connect card. Before giving up, an expired-looking 401 gets exactly
 * ONE forced refresh + retry of the same call, because the common case is a
 * token the provider invalidated ahead of its stated expiry.
 *
 * Challenge interpretation mirrors `crates/agiworkforce-mcp/src/oauth/flow.rs`
 * (see lib/connectors/oauth-challenge.ts): a 401 means reconnect, a 403 means
 * reconnect only when it carries `error="insufficient_scope"`.
 */
async function executeOAuthConnectorTool(
  userId: string,
  connectorId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ConnectorExecResult> {
  const provider = getConnectorOAuthProvider(connectorId);
  if (!provider) return NOT_HANDLED;

  const access = await resolveConnectorAccessToken(userId, connectorId);
  if (access.status !== 'ready') {
    return connectRequiredResult({
      connectorId,
      toolName,
      reason: access.status === 'not-connected' ? 'not_connected' : 'authorization_expired',
    });
  }

  try {
    return await callOAuthConnectorTool(
      userId,
      provider,
      access.accessToken,
      access.tokenType,
      toolName,
      args,
    );
  } catch (err) {
    if (err instanceof EgressPolicyError) {
      logger.warn(
        { connectorId },
        '[user-connector] OAuth connector endpoint blocked by SSRF policy at execution',
      );
      return {
        handled: true,
        content: 'Connector endpoint blocked by security policy.',
        isError: true,
      };
    }

    const challenge = detectConnectorAuthChallenge(err);
    if (!challenge) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { connectorId, toolName, error: msg },
        '[user-connector] OAuth connector tool execution failed',
      );
      return { handled: true, content: `Connector tool error: ${msg}`, isError: true };
    }

    // The cached handle carries the rejected Authorization header; drop it so
    // the retry below connects with the refreshed credential.
    await evictConnectorOAuthCaches(userId, connectorId);

    if (challenge.status === 403) {
      return connectRequiredResult({
        connectorId,
        toolName,
        reason: 'insufficient_scope',
        additionalScopes: challenge.requiredScope?.split(/\s+/).filter(Boolean) ?? [],
      });
    }

    const refreshed = await resolveConnectorAccessToken(userId, connectorId, {
      forceRefresh: true,
    });
    if (refreshed.status !== 'ready') {
      return connectRequiredResult({ connectorId, toolName, reason: 'authorization_expired' });
    }

    try {
      return await callOAuthConnectorTool(
        userId,
        provider,
        refreshed.accessToken,
        refreshed.tokenType,
        toolName,
        args,
      );
    } catch (retryErr) {
      if (detectConnectorAuthChallenge(retryErr)) {
        // A freshly-minted token was rejected too. Nothing this server can do
        // recovers that; the user has to authorize again.
        await evictConnectorOAuthCaches(userId, connectorId);
        return connectRequiredResult({
          connectorId,
          toolName,
          reason: 'authorization_unavailable',
        });
      }
      const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      logger.warn(
        { connectorId, toolName, error: msg },
        '[user-connector] OAuth connector tool retry failed',
      );
      return { handled: true, content: `Connector tool error: ${msg}`, isError: true };
    }
  }
}

// ─── Organization-shared custom connectors (migration 0086) ────────────────
//
// An org admin connects a server once and every member can USE it. Members
// never see the credential: `auth_header_enc` is decrypted here, server-side,
// exactly as for a personal connector, and no API surface returns it.
//
// Namespace. Shared connectors are emitted as `orgmcp-<org_short_id>`, NOT
// `custom-<short_id>`. `short_id` is unique only per (user_id, short_id), so
// reusing it would let two members' personal connectors collide with the
// shared one inside a single conversation, and would cross-wire
// `connector_tool_permissions` (keyed user_id + connector_id + tool_name). The
// `orgmcp-` prefix contains no underscore, so it still parses under
// `mcp__<serverId>__<tool>` (parseQualifiedToolName).
//
// Cache scope. The catalog/handle caches below are keyed by ORGANIZATION +
// row uuid, not by member. That is correct and deliberate: unlike a personal
// connector, one shared credential serves every member, and there is no
// per-member header anywhere on this path. If a per-member header is ever
// introduced, this key MUST become per-member on the same commit.

const ORG_SHARED_SERVER_PREFIX = 'orgmcp-';
const ORG_SHORT_ID_RE = /^[0-9a-f]{10}$/;

function orgSharedServerId(orgShortId: string): string {
  return `${ORG_SHARED_SERVER_PREFIX}${orgShortId}`;
}

function orgShortIdFromServerId(serverId: string): string | null {
  if (!serverId.startsWith(ORG_SHARED_SERVER_PREFIX)) return null;
  const shortId = serverId.slice(ORG_SHARED_SERVER_PREFIX.length);
  return ORG_SHORT_ID_RE.test(shortId) ? shortId : null;
}

interface OrgSharedConnectorRow extends CustomConnectorRow {
  organization_id: string;
  org_short_id: string;
}

/**
 * The organization this user belongs to, read from the membership table.
 *
 * This is the ONLY source of org scope on this path. Nothing about the chat
 * request can influence it, so a member of org A can never reach org B's shared
 * connectors even if they guess an `orgmcp-` id.
 */
async function resolveConnectorOrganizationId(
  userId: string,
  admittedOrganizationId?: string | null,
): Promise<string | null> {
  const db = getNeonDb();
  try {
    if (admittedOrganizationId === undefined) {
      return await resolveActiveOrganizationId(db, userId);
    }
    if (admittedOrganizationId === null) return null;
    const [membership] = await db.query<{ organization_id: string }>(
      `select organization_id
         from public.organization_members
        where organization_id = $1 and user_id = $2
        limit 1`,
      [admittedOrganizationId, userId],
    );
    return membership?.organization_id ?? null;
  } catch (error) {
    if (isUndefinedTable(error)) return null;
    throw error;
  }
}

/**
 * Shared connector rows this member may use.
 *
 * Runs on the privileged connection because it must read `auth_header_enc` to
 * connect — the same regime every other credentialed connector read uses. The
 * tenant boundary here is therefore the `s.organization_id = $1` predicate with
 * a SERVER-DERIVED id, and it is pinned by
 * `lib/services/__tests__/org-shared-connector-service.test.ts`.
 *
 * The owner's own rows are skipped: they already appear in the member's
 * personal `custom-` catalog, and offering the same server twice would double
 * its prompt weight and confuse the model.
 */
async function getOrgSharedConnectorRows(
  userId: string,
  organizationId: string,
  limit?: number,
): Promise<OrgSharedConnectorRow[]> {
  const db = getNeonDb();
  try {
    const rows = await db.query<OrgSharedConnectorRow>(
      `select c.id, c.short_id, c.name, c.url, c.transport, c.auth_header_enc,
              s.organization_id, s.org_short_id
         from public.organization_shared_connectors s
         join public.user_custom_connectors c on c.id = s.connector_row_id
        where s.organization_id = $1
          and c.user_id <> $2
        order by s.created_at asc, s.connector_row_id asc
        limit $3`,
      [organizationId, userId, limit ?? null],
    );
    return limit === undefined ? rows : rows.slice(0, limit);
  } catch (error) {
    if (isUndefinedTable(error)) return [];
    throw error;
  }
}

const _orgSharedCatalogCache = new Map<string, CustomCatalogState>();
const _orgSharedHandles = new Map<string, McpServerHandle>();

function orgSharedCacheKey(organizationId: string, rowId: string): string {
  return `${encodeURIComponent(organizationId)}:${encodeURIComponent(rowId)}`;
}

/**
 * Release the cached catalog and close the open MCP handle for a connector the
 * organization has just un-shared. Without this a member keeps invoking a
 * withdrawn connector until the process restarts — the DB row is gone but the
 * live handle is not.
 */
export async function evictOrgSharedConnectorCaches(
  organizationId: string,
  rowId: string,
): Promise<void> {
  const cacheKey = orgSharedCacheKey(organizationId, rowId);
  _orgSharedCatalogCache.delete(cacheKey);
  const handle = _orgSharedHandles.get(cacheKey);
  if (handle) {
    _orgSharedHandles.delete(cacheKey);
    await handle.close().catch(() => undefined);
  }
}

async function buildOrgSharedConnectorCatalog(
  row: OrgSharedConnectorRow,
): Promise<McpToolCatalog | null> {
  const now = Date.now();
  const cacheKey = orgSharedCacheKey(row.organization_id, row.id);
  const cached = _orgSharedCatalogCache.get(cacheKey);
  if (cached && cached.catalog && now < cached.expiresAt) return cached.catalog;

  // SSRF: DNS can be re-pointed after the share, so re-check on every build —
  // the same rule the personal path already applies.
  try {
    await assertResolvedPublicHostname(row.url);
  } catch (err) {
    if (err instanceof EgressPolicyError) {
      logger.warn(
        { rowId: row.id, organizationId: row.organization_id },
        '[user-connector] shared connector endpoint blocked by SSRF policy',
      );
      _orgSharedCatalogCache.set(cacheKey, {
        catalog: null,
        expiresAt: now + CUSTOM_CATALOG_TTL_MS,
      });
      return null;
    }
    throw err;
  }

  const serverId = orgSharedServerId(row.org_short_id);
  try {
    const { catalog, handles } = await buildMcpToolCatalog({
      [serverId]: customRowToMcpConfig(row),
    });
    for (const h of handles) {
      const old = _orgSharedHandles.get(cacheKey);
      _orgSharedHandles.set(cacheKey, h);
      if (old && old !== h) await old.close().catch(() => undefined);
    }
    _orgSharedCatalogCache.set(cacheKey, { catalog, expiresAt: now + CUSTOM_CATALOG_TTL_MS });
    return catalog;
  } catch (err) {
    logger.warn(
      { rowId: row.id, error: err instanceof Error ? err.message : err },
      '[user-connector] failed to build shared connector catalog',
    );
    _orgSharedCatalogCache.set(cacheKey, { catalog: null, expiresAt: now + CUSTOM_CATALOG_TTL_MS });
    return null;
  }
}

async function executeOrgSharedConnectorTool(
  userId: string,
  admittedOrganizationId: string | null | undefined,
  orgShortId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ConnectorExecResult> {
  // Re-resolve BOTH the membership and the share at execution time. A member
  // removed from the org, or a connector un-shared, must stop working on the
  // very next call — not when a cache expires.
  const organizationId = await resolveConnectorOrganizationId(userId, admittedOrganizationId);
  if (!organizationId) {
    return {
      handled: true,
      content: 'This shared connector is not available for this account.',
      isError: true,
    };
  }

  const db = getNeonDb();
  let rows: OrgSharedConnectorRow[];
  try {
    rows = await db.query<OrgSharedConnectorRow>(
      `select c.id, c.short_id, c.name, c.url, c.transport, c.auth_header_enc,
              s.organization_id, s.org_short_id
         from public.organization_shared_connectors s
         join public.user_custom_connectors c on c.id = s.connector_row_id
        where s.organization_id = $1
          and s.org_short_id = $2`,
      [organizationId, orgShortId],
    );
  } catch (error) {
    if (isUndefinedTable(error)) rows = [];
    else throw error;
  }

  const row = rows[0];
  if (!row) {
    return {
      handled: true,
      content: 'This shared connector is no longer available for this organization.',
      isError: true,
    };
  }

  try {
    const cacheKey = orgSharedCacheKey(row.organization_id, row.id);
    let handle = _orgSharedHandles.get(cacheKey);
    if (!handle) {
      await assertResolvedPublicHostname(row.url);
      handle = await connectMcpServer({
        serverName: orgSharedServerId(row.org_short_id),
        config: customRowToMcpConfig(row),
      });
      _orgSharedHandles.set(cacheKey, handle);
    }
    const result = await handle.callTool(toolName, args);
    const text = mcpResultToText(result);
    return { handled: true, content: text || '(no output)', isError: result.isError === true };
  } catch (err) {
    if (err instanceof EgressPolicyError) {
      return {
        handled: true,
        content: 'This shared connector endpoint is not reachable from this environment.',
        isError: true,
      };
    }
    if (err instanceof ConnectorCredentialError) {
      return { handled: true, content: err.message, isError: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { rowId: row.id, toolName, error: msg },
      '[user-connector] shared connector tool call failed',
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
  options: LoadUserConnectorToolOptions = {},
): Promise<WebMcpToolDef[]> {
  return (await loadUserConnectorToolCatalog(userId, options)).tools;
}

export interface LoadUserConnectorToolOptions {
  customConnectorLimit?: number;
  /** Workspace captured at request admission; null is Personal. */
  organizationId?: string | null;
  /**
   * GOV-7: the caller's billing plan tier, used to resolve the per-plan
   * connector-tool ceiling. Omitted/unknown falls back to
   * `MAX_CONNECTOR_TOOLS_PER_USER`.
   */
  planTier?: string | null;
  /**
   * AUDIT-FIX CON-2: drop tools the user has BLOCKED from the catalog
   * entirely. Without this filter a blocked tool was still advertised to the
   * model on every turn, so the model kept calling it and the approval card
   * kept re-appearing — the user's "never do this" produced an endless prompt
   * instead of silence. Filtering at the catalog is what actually makes the
   * verdict stick; the tool loop's execution-time check (CON-1) remains as
   * defense in depth for a model that hallucinates the name anyway.
   *
   * Receives the CONNECTOR id (the MCP serverId) and the BARE tool name,
   * matching how `connector_tool_permissions` is keyed.
   */
  isToolDenied?: (connectorId: string, toolName: string) => boolean;
}

/**
 * GOV-7 — the catalog-returning form of `loadUserConnectorToolDefs`, for
 * callers that want to tell the user when the per-plan ceiling dropped tools.
 * `loadUserConnectorToolDefs` above is the array-only wrapper.
 */
export async function loadUserConnectorToolCatalog(
  userId: string,
  options: LoadUserConnectorToolOptions = {},
): Promise<UserConnectorToolCatalog> {
  const limit = resolveConnectorToolLimit(options.planTier);
  if (!userId) return { tools: [], dropped: [], limit };
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

    // 2b. Per-user OAuth connectors (0097). Offered ONLY when this user holds a
    // live grant whose token can be resolved right now — the same "invoking
    // would actually work" rule the other sources follow, which is why a
    // provider with no grant keeps reading as Connect rather than Connected.
    //
    // The user's live grants are read ONCE and intersected with the configured
    // providers, so a deployment with many registered OAuth apps does not issue
    // one lookup per provider on every chat turn.
    const usableOAuthIds = getUsableOAuthConnectorIds();
    const grantedOAuthIds =
      usableOAuthIds.length > 0
        ? new Set((await getUserConnectorOAuthGrantSummaries(userId)).map((g) => g.connectorId))
        : new Set<string>();
    for (const connectorId of usableOAuthIds) {
      if (!grantedOAuthIds.has(connectorId)) continue;
      const provider = getConnectorOAuthProvider(connectorId);
      if (!provider) continue;
      const access = await resolveConnectorAccessToken(userId, connectorId);
      if (access.status !== 'ready') continue;
      const catalog = await buildOAuthConnectorCatalog(
        userId,
        provider,
        access.accessToken,
        access.tokenType,
      );
      if (catalog) {
        defs.push(...catalogToConnectorToolDefs(catalog, provider.displayName ?? connectorId));
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

    // 4. Connectors the user's ORGANIZATION shares with its members (0086).
    // Same failure posture as 3: each row degrades to no tools independently.
    // The route captures the active workspace at admission so a background
    // continuation cannot drift into a newly selected workspace mid-turn.
    const organizationId = await resolveConnectorOrganizationId(userId, options.organizationId);
    if (organizationId) {
      const sharedRows = await getOrgSharedConnectorRows(
        userId,
        organizationId,
        customConnectorLimit,
      );
      for (const row of sharedRows) {
        const catalog = await buildOrgSharedConnectorCatalog(row);
        if (catalog) defs.push(...catalogToConnectorToolDefs(catalog, row.name));
      }
    }

    // AUDIT-FIX CON-2: apply the user's blocks BEFORE the per-user cap, so a
    // blocked tool cannot crowd an allowed one out of the catalog.
    const isToolDenied = options.isToolDenied;
    const allowed = isToolDenied
      ? defs.filter((def) => !isToolDenied(def.serverId, def.toolName))
      : defs;
    if (isToolDenied && allowed.length !== defs.length) {
      logger.info(
        { userId, blocked: defs.length - allowed.length },
        '[user-connector] omitted blocked connector tools from the offered catalog',
      );
    }

    // GOV-7: apply the PER-PLAN ceiling (was a flat 32 for every tier) and
    // report what it cost. Truncating silently while the connector still reads
    // "Connected" is the failure this replaces: the model could not call the
    // dropped tools and nothing anywhere told the user why.
    if (limit !== null && allowed.length > limit) {
      const kept = allowed.slice(0, limit);
      const droppedByConnector = new Map<string, DroppedConnectorTools>();
      for (const def of allowed.slice(limit)) {
        const existing = droppedByConnector.get(def.serverId);
        if (existing) {
          existing.droppedToolCount += 1;
        } else {
          droppedByConnector.set(def.serverId, {
            connectorId: def.serverId,
            connectorLabel: def.serverLabel ?? def.serverId,
            droppedToolCount: 1,
          });
        }
      }
      const dropped = [...droppedByConnector.values()];
      logger.warn(
        { userId, total: allowed.length, cap: limit, planTier: options.planTier, dropped },
        '[user-connector] per-plan connector-tool ceiling truncated the offered catalog',
      );
      return { tools: kept, dropped, limit };
    }
    return { tools: allowed, dropped: [], limit };
  } catch (err) {
    logger.warn(
      { userId, error: err instanceof Error ? err.message : err },
      '[user-connector] failed to assemble connector tools — proceeding without them',
    );
    return { tools: [], dropped: [], limit };
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
  organizationId?: string | null,
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

    // Organization-shared connector (0086). Membership and the share row are
    // both re-resolved inside the executor, so a removed member or an
    // un-shared connector stops working on the very next call.
    const orgShortId = orgShortIdFromServerId(serverId);
    if (orgShortId !== null) {
      return executeOrgSharedConnectorTool(userId, organizationId, orgShortId, toolName, args);
    }

    const map = loadConnectorMcpMap();
    const entry = map.get(serverId);
    if (!entry) {
      // Per-user OAuth connector (0097). Checked AFTER the operator map so a
      // duplicated id keeps its existing operator-credentialed behaviour, and
      // it re-resolves the grant on every call, so a disconnect stops working
      // on the very next tool call rather than when a cache expires.
      if (getConnectorOAuthProvider(serverId)) {
        return executeOAuthConnectorTool(userId, serverId, toolName, args);
      }
      return NOT_HANDLED;
    }

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
