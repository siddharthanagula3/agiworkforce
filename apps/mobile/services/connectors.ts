/**
 * Connectors service — thin client over the web app's /api/connectors route.
 *
 * GET    /api/connectors                          → active rows + deployment availability
 * POST   /api/connectors {connectorId}            → enable an operator-mapped provider
 * DELETE /api/connectors?connectorId=<id>         → soft-disconnect
 * GET    /api/connectors/oauth/start?mode=json    → begin a per-user OAuth grant
 *
 * Auth is the standard Bearer JWT from services/api.ts (Bearer requests bypass
 * the web CSRF check by design — see apps/web/lib/csrf.ts).
 */

import { api } from './api';
import { API_URL } from '@/lib/constants';

/**
 * URL of the web GitHub-App install flow. GitHub connection uses a GitHub App
 * installation (not user_connectors), and the server flow is Clerk-cookie based;
 * rather than reimplement OAuth state/CSRF on the client, mobile opens this vetted
 * web flow in a browser and refreshes its connector list on return.
 */
export function getGitHubInstallWebUrl(): string {
  return `${API_URL}/api/github/install/start`;
}

/**
 * Where the server derived this connected row from. Mirrors the `source` union
 * in apps/web/app/api/connectors/route.ts — `oauth` is a per-user grant written
 * by the connector OAuth broker (db/neon/0097), which has no `user_connectors`
 * row at all. Before `oauth` was accepted here the whole directory response
 * failed to parse the moment an account held a single OAuth grant.
 */
export type ConnectorSource = 'user' | 'github-app' | 'custom' | 'oauth';

const CONNECTOR_SOURCES: readonly ConnectorSource[] = ['user', 'github-app', 'custom', 'oauth'];

export interface ConnectedConnector {
  /** Row id. */
  id: string;
  /** Catalog connector id (e.g. 'github'). */
  connectorId: string;
  authType: string;
  connectedAt: string;
  updatedAt: string;
  source: ConnectorSource;
  /** Server-owned display name for custom MCP rows. */
  name?: string;
  /** OAuth grants only: the scopes the provider actually granted. */
  scopes?: string[];
  /**
   * OAuth grants only: the stored access token has expired and no refresh token
   * exists, so the grant can no longer be renewed without the user
   * reauthorizing. Never inferred on the client — the server owns this.
   */
  needsReauthorization?: boolean;
}

export interface ConnectorDirectory {
  connectors: ConnectedConnector[];
  /** Providers this deployment can connect right now. */
  available: string[];
}

export type ConnectorToolPermissionLevel = 'allow' | 'ask' | 'deny';

export interface ConnectorToolPermission {
  /** Runtime connector/server id used by the Cloud tool loop. */
  connectorId: string;
  /** Exact wire tool name observed by the approval flow. */
  toolName: string;
  level: ConnectorToolPermissionLevel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseConnectedConnector(value: unknown): ConnectedConnector {
  if (!isRecord(value)) throw new Error('Invalid connectors response');
  const source = value['source'];
  if (!CONNECTOR_SOURCES.includes(source as ConnectorSource)) {
    throw new Error('Invalid connectors response');
  }
  for (const field of ['id', 'connectorId', 'authType', 'connectedAt', 'updatedAt'] as const) {
    if (typeof value[field] !== 'string') throw new Error('Invalid connectors response');
  }
  if (value['name'] !== undefined && typeof value['name'] !== 'string') {
    throw new Error('Invalid connectors response');
  }
  const scopes = value['scopes'];
  if (
    scopes !== undefined &&
    (!Array.isArray(scopes) || scopes.some((s) => typeof s !== 'string'))
  ) {
    throw new Error('Invalid connectors response');
  }
  const needsReauthorization = value['needsReauthorization'];
  if (needsReauthorization !== undefined && typeof needsReauthorization !== 'boolean') {
    throw new Error('Invalid connectors response');
  }
  const id = value['id'] as string;
  const connectorId = value['connectorId'] as string;
  const authType = value['authType'] as string;
  const connectedAt = value['connectedAt'] as string;
  const updatedAt = value['updatedAt'] as string;
  return {
    id,
    connectorId,
    authType,
    connectedAt,
    updatedAt,
    source: source as ConnectorSource,
    ...(typeof value['name'] === 'string' ? { name: value['name'] } : {}),
    ...(Array.isArray(scopes) ? { scopes: scopes as string[] } : {}),
    ...(typeof needsReauthorization === 'boolean' ? { needsReauthorization } : {}),
  };
}

export async function fetchConnectorDirectory(): Promise<ConnectorDirectory> {
  const response = await api.get<unknown>('/api/connectors');
  if (
    !isRecord(response) ||
    !Array.isArray(response['connectors']) ||
    !Array.isArray(response['available']) ||
    !response['available'].every((id) => typeof id === 'string')
  ) {
    throw new Error('Invalid connectors response');
  }
  return {
    connectors: response['connectors'].map(parseConnectedConnector),
    available: [...new Set(response['available'] as string[])],
  };
}

/** Compatibility helper for callers that only need the connected rows. */
export async function listConnectedConnectors(): Promise<ConnectedConnector[]> {
  return (await fetchConnectorDirectory()).connectors;
}

// ---------------------------------------------------------------------------
// Per-user connector OAuth (apps/web/app/api/connectors/oauth/start/route.ts)
// ---------------------------------------------------------------------------

/**
 * Path that begins the hosted per-user OAuth flow. Mirrors
 * `CONNECTOR_OAUTH_START_PATH` in apps/web/lib/connectors/oauth-registry.ts.
 */
const CONNECTOR_OAUTH_START_PATH = '/api/connectors/oauth/start';

export interface ConnectorOAuthStart {
  connectorId: string;
  /** The provider's authorization URL, carrying this flow's single-use state. */
  authorizeUrl: string;
}

/**
 * `mode=json` is the native branch of the start route: a browser gets a 302 to
 * the provider, but a mobile client cannot follow that chain itself (the sheet
 * it would open has no Bearer token), so it asks for `{ connectorId,
 * authorizeUrl }` and opens the authorize URL itself.
 */
function buildConnectorOAuthStartRequestPath(connectorId: string): string {
  return `${CONNECTOR_OAUTH_START_PATH}?connectorId=${encodeURIComponent(connectorId)}&mode=json`;
}

/** True only for a credential-free https URL — never `http:` for an OAuth handoff. */
function isHttpsAuthorizeUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '';
  } catch {
    return false;
  }
}

/**
 * Ask the broker to open a pending authorization and hand back the provider's
 * authorization URL.
 *
 * Throws the server's own message when this deployment has no OAuth app for the
 * connector (501) or the broker tables are missing (503) — mobile must never
 * synthesize an authorize URL of its own, because a wrong endpoint would send an
 * authorization code to the wrong host.
 */
export async function startConnectorOAuth(connectorId: string): Promise<ConnectorOAuthStart> {
  const response = await api.get<unknown>(buildConnectorOAuthStartRequestPath(connectorId));
  if (!isRecord(response) || response['connectorId'] !== connectorId) {
    throw new Error('Invalid connector authorization response');
  }
  const authorizeUrl = response['authorizeUrl'];
  if (!isHttpsAuthorizeUrl(authorizeUrl)) {
    throw new Error('Invalid connector authorization response');
  }
  return { connectorId, authorizeUrl };
}

/**
 * Result of asking to connect a provider.
 *
 * `connected` is returned ONLY when the server actually wrote the enablement
 * row (201). `oauth-required` means the connector connects through the
 * authorization-code flow instead, and nothing is connected until the user
 * completes it and the server writes a grant.
 */
export type ConnectConnectorResult =
  | { kind: 'connected' }
  | { kind: 'oauth-required'; connectorId: string; authorizeUrl: string };

/**
 * HTTP status of a failed api.* call.
 *
 * Read structurally rather than with `instanceof ApiHttpError`: several suites
 * mock `services/api` with a bare object, so the class would be undefined at
 * runtime there and `instanceof` would throw.
 */
function httpStatusOf(error: unknown): number | null {
  if (error && typeof error === 'object') {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return null;
}

/**
 * Connect a provider the server advertised in `available`. The native directory
 * never calls this for an unavailable catalog row; GitHub uses its separately
 * verified installation flow.
 *
 * A provider with a registered platform OAuth app answers this POST with 409
 * ("connects through OAuth authorization, not a directory toggle" — see
 * apps/web/app/api/connectors/route.ts), which is the server telling the client
 * to run the authorization-code flow instead. The 409 body carries
 * `oauthStartPath`, but the shared HTTP client keeps only the status and the
 * human-readable message, so the start request is rebuilt from the same
 * contract path rather than from an invented one. The POST has no side effects
 * on that branch, so trying it first keeps the operator-mapped path untouched.
 */
export async function connectConnector(connectorId: string): Promise<ConnectConnectorResult> {
  try {
    await api.post('/api/connectors', { connectorId });
    return { kind: 'connected' };
  } catch (error) {
    if (httpStatusOf(error) !== 409) throw error;
    const start = await startConnectorOAuth(connectorId);
    return {
      kind: 'oauth-required',
      connectorId: start.connectorId,
      authorizeUrl: start.authorizeUrl,
    };
  }
}

export async function disconnectConnector(connectorId: string): Promise<void> {
  await api.delete(`/api/connectors?connectorId=${encodeURIComponent(connectorId)}`);
}

function parseConnectorToolPermission(value: unknown): ConnectorToolPermission {
  if (!isRecord(value)) throw new Error('Invalid connector permissions response');
  const connectorId = value['connectorId'];
  const toolName = value['toolName'];
  const level = value['level'];
  if (
    typeof connectorId !== 'string' ||
    connectorId.length === 0 ||
    typeof toolName !== 'string' ||
    toolName.length === 0 ||
    (level !== 'allow' && level !== 'ask' && level !== 'deny')
  ) {
    throw new Error('Invalid connector permissions response');
  }
  return { connectorId, toolName, level };
}

/**
 * Returns only server-persisted decisions for tools the account has actually
 * encountered. The connector API does not expose a trustworthy complete tool
 * catalog, so Mobile must never synthesize one from marketing labels.
 */
export async function fetchConnectorToolPermissions(): Promise<ConnectorToolPermission[]> {
  const response = await api.get<unknown>('/api/connectors/permissions');
  if (!isRecord(response) || !Array.isArray(response['permissions'])) {
    throw new Error('Invalid connector permissions response');
  }
  return response['permissions'].map(parseConnectorToolPermission);
}

export async function setConnectorToolPermission(
  connectorId: string,
  toolName: string,
  level: ConnectorToolPermissionLevel,
): Promise<void> {
  await api.put('/api/connectors/permissions', { connectorId, toolName, level });
}

export async function resetConnectorToolPermission(
  connectorId: string,
  toolName: string,
): Promise<void> {
  await api.delete(
    `/api/connectors/permissions?connectorId=${encodeURIComponent(
      connectorId,
    )}&toolName=${encodeURIComponent(toolName)}`,
  );
}

export interface AddCustomConnectorInput {
  name: string;
  /** Public HTTPS remote-MCP endpoint (validated server-side; no embedded creds). */
  url: string;
  transport?: 'sse' | 'streamable-http';
  /** Optional bearer token stored encrypted server-side; never echoed back. */
  authToken?: string;
}

export interface CustomConnectorResult {
  id: string;
  shortId: string;
  name: string;
  url: string;
}

/**
 * Add a user-owned custom remote-MCP connector, reusing the same server route
 * the web app uses (`POST /api/connectors/custom`). The server validates the URL
 * (https, public DNS-resolved host, no embedded credentials) and enforces the
 * per-tier custom-connector limit — so this needs no OAuth app registration and
 * works today. Its tools appear to models as `mcp__custom-<shortId>__<tool>`.
 */
export async function addCustomConnector(
  input: AddCustomConnectorInput,
): Promise<CustomConnectorResult> {
  const response = await api.post<{ connector: CustomConnectorResult }>('/api/connectors/custom', {
    name: input.name.trim(),
    url: input.url.trim(),
    ...(input.transport ? { transport: input.transport } : {}),
    ...(input.authToken?.trim() ? { authToken: input.authToken.trim() } : {}),
  });
  return response.connector;
}

export async function deleteCustomConnector(id: string): Promise<void> {
  await api.delete(`/api/connectors/custom?id=${encodeURIComponent(id)}`);
}
