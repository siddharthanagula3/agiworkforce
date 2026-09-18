import {
  evaluateConnectorAccess,
  evaluateMcpHostAccess,
  evaluatePluginAccess,
  resolveConnectorHealth,
} from './policy';
import {
  parseConnectorList,
  parseConnectorOAuthStart,
  parseConnectorPolicy,
  parseConnectorToolPermissions,
  parseCustomConnector,
} from './parse';
import type {
  AddCustomConnectorInput,
  ConnectResult,
  ConnectedConnector,
  ConnectorAccessDecision,
  ConnectorAccessPolicy,
  ConnectorDirectory,
  ConnectorDirectoryEntry,
  ConnectorOAuthStart,
  ConnectorSurface,
  ConnectorToolPermission,
  ConnectorToolPermissionLevel,
  CustomConnectorResult,
} from './types';

/** What the administrator permits, separate from what the member connected. */
export const CONNECTOR_POLICY_PATH = '/api/settings/organization/connector-policy';

export interface ConnectorEndpoints {
  connectors: string;
  oauthStart: string;
  permissions: string;
  custom: string;
  policy: string;
}

export function connectorEndpoints(base: {
  connectors: string;
  oauthStart: string;
}): ConnectorEndpoints {
  return {
    connectors: base.connectors,
    oauthStart: base.oauthStart,
    permissions: `${base.connectors}/permissions`,
    custom: `${base.connectors}/custom`,
    policy: CONNECTOR_POLICY_PATH,
  };
}

export class ConnectorHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ConnectorHttpError';
    this.status = status;
  }
}

/** Surfaces render `reason` verbatim; it is the sentence the server gate logs. */
export class ConnectorPolicyError extends Error {
  readonly decision: ConnectorAccessDecision;
  readonly connectorId: string | null;

  constructor(decision: ConnectorAccessDecision, connectorId: string | null) {
    super(decision.reason);
    this.name = 'ConnectorPolicyError';
    this.decision = decision;
    this.connectorId = connectorId;
  }
}

export interface ConnectorHttpClient {
  get(path: string): Promise<unknown>;
  post(path: string, body?: unknown): Promise<unknown>;
  put(path: string, body?: unknown): Promise<unknown>;
  delete(path: string): Promise<unknown>;
}

export interface ConnectorLocalBridge {
  list(): Promise<string[]>;
  connect(connectorId: string, authType: string): Promise<void>;
  disconnect(connectorId: string): Promise<void>;
}

export interface ConnectorRuntimeOptions {
  surface: ConnectorSurface;
  http: ConnectorHttpClient;
  endpoints: ConnectorEndpoints;
  /** Desktop runs connectors against the local MCP host; the policy still decides. */
  local?: ConnectorLocalBridge;
  /** Connectors whose tools this surface cannot run at all. */
  isSupportedHere?: (connectorId: string) => boolean;
  policyTtlMs?: number;
  now?: () => number;
}

const DEFAULT_POLICY_TTL_MS = 30_000;

export interface ConnectorRuntime {
  readonly surface: ConnectorSurface;
  loadPolicy(options?: { force?: boolean }): Promise<ConnectorAccessPolicy | null>;
  invalidatePolicy(): void;
  checkConnector(
    connectorId: string,
    ask?: { isCustom?: boolean; url?: string | null },
  ): Promise<ConnectorAccessDecision>;
  checkPlugin(pluginKey: string): Promise<ConnectorAccessDecision>;
  checkMcpHost(url: string): Promise<ConnectorAccessDecision>;
  loadDirectory(): Promise<ConnectorDirectory>;
  listConnected(): Promise<ConnectedConnector[]>;
  connect(connectorId: string, authType?: string): Promise<ConnectResult>;
  disconnect(connectorId: string): Promise<void>;
  startOAuth(connectorId: string): Promise<ConnectorOAuthStart>;
  listToolPermissions(): Promise<ConnectorToolPermission[]>;
  setToolPermission(
    connectorId: string,
    toolName: string,
    level: ConnectorToolPermissionLevel,
  ): Promise<void>;
  resetToolPermission(connectorId: string, toolName: string): Promise<void>;
  addCustomConnector(input: AddCustomConnectorInput): Promise<CustomConnectorResult>;
  deleteCustomConnector(id: string): Promise<void>;
}

function statusOf(error: unknown): number | null {
  if (error instanceof ConnectorHttpError) return error.status;
  if (error && typeof error === 'object') {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return null;
}

function installUrlOf(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const body = (error as { body?: unknown }).body;
  if (!body || typeof body !== 'object') return null;
  const path = (body as { installStartPath?: unknown }).installStartPath;
  return typeof path === 'string' && path.length > 0 ? path : null;
}

export function createConnectorRuntime(options: ConnectorRuntimeOptions): ConnectorRuntime {
  const { surface, http, endpoints, local } = options;
  const ttl = options.policyTtlMs ?? DEFAULT_POLICY_TTL_MS;
  const now = options.now ?? (() => Date.now());

  let cached: { policy: ConnectorAccessPolicy | null; at: number } | null = null;
  let inFlight: Promise<ConnectorAccessPolicy | null> | null = null;

  // Fail open: the server gate is authoritative, and an unreachable policy
  // endpoint must not strand a member whose workspace permits everything.
  async function readPolicy(): Promise<ConnectorAccessPolicy | null> {
    try {
      return parseConnectorPolicy(await http.get(endpoints.policy));
    } catch {
      return null;
    }
  }

  async function loadPolicy(opts?: { force?: boolean }): Promise<ConnectorAccessPolicy | null> {
    if (!opts?.force && cached && now() - cached.at < ttl) return cached.policy;
    if (!opts?.force && inFlight) return inFlight;
    const request = readPolicy().then((policy) => {
      cached = { policy, at: now() };
      return policy;
    });
    inFlight = request;
    try {
      return await request;
    } finally {
      if (inFlight === request) inFlight = null;
    }
  }

  async function checkConnector(
    connectorId: string,
    ask?: { isCustom?: boolean; url?: string | null },
  ): Promise<ConnectorAccessDecision> {
    return evaluateConnectorAccess(await loadPolicy(), {
      connectorId,
      ...(ask?.isCustom === undefined ? {} : { isCustom: ask.isCustom }),
      ...(ask?.url ? { url: ask.url } : {}),
    });
  }

  async function requireConnector(
    connectorId: string,
    ask?: { isCustom?: boolean; url?: string | null },
  ): Promise<void> {
    const decision = await checkConnector(connectorId, ask);
    if (!decision.allowed) throw new ConnectorPolicyError(decision, connectorId);
  }

  async function loadDirectory(): Promise<ConnectorDirectory> {
    const [listed, policy] = await Promise.all([
      http.get(endpoints.connectors).then(parseConnectorList),
      loadPolicy(),
    ]);
    const localIds = local ? new Set(await local.list()) : null;
    const byId = new Map(listed.connectors.map((entry) => [entry.connectorId, entry]));
    const ids = new Set<string>([
      ...listed.available,
      ...listed.connectors.map((entry) => entry.connectorId),
      ...(localIds ?? []),
    ]);

    const entries: ConnectorDirectoryEntry[] = [...ids].map((connectorId) => {
      const connection = byId.get(connectorId) ?? null;
      const supportedHere = options.isSupportedHere?.(connectorId) ?? true;
      const available =
        listed.available.includes(connectorId) || localIds?.has(connectorId) === true;
      const access = evaluateConnectorAccess(policy, { connectorId });
      return {
        connectorId,
        connection: connection
          ? {
              ...connection,
              health: resolveConnectorHealth({
                supportedHere,
                available,
                connected: true,
                ...(connection.needsReauthorization === undefined
                  ? {}
                  : { needsReauthorization: connection.needsReauthorization }),
              }),
            }
          : null,
        available,
        access,
      };
    });

    return { connectors: listed.connectors, available: listed.available, entries, policy };
  }

  async function startOAuth(connectorId: string): Promise<ConnectorOAuthStart> {
    await requireConnector(connectorId);
    const path = `${endpoints.oauthStart}?connectorId=${encodeURIComponent(connectorId)}&mode=json`;
    return parseConnectorOAuthStart(connectorId, await http.get(path));
  }

  return {
    surface,
    loadPolicy,
    invalidatePolicy() {
      cached = null;
      inFlight = null;
    },
    checkConnector,
    async checkPlugin(pluginKey: string) {
      return evaluatePluginAccess(await loadPolicy(), pluginKey);
    },
    async checkMcpHost(url: string) {
      return evaluateMcpHostAccess(await loadPolicy(), url);
    },
    loadDirectory,
    async listConnected() {
      return (await loadDirectory()).connectors;
    },
    async connect(connectorId: string, authType?: string): Promise<ConnectResult> {
      await requireConnector(connectorId);
      if (local) {
        await local.connect(connectorId, authType ?? 'oauth');
        return { kind: 'connected' };
      }
      try {
        await http.post(endpoints.connectors, {
          connectorId,
          ...(authType ? { authType } : {}),
        });
        return { kind: 'connected' };
      } catch (error) {
        if (statusOf(error) !== 409) throw error;
        const installStartPath = installUrlOf(error);
        if (installStartPath) {
          return { kind: 'install-required', connectorId, installUrl: installStartPath };
        }
        const start = await startOAuth(connectorId);
        return {
          kind: 'oauth-required',
          connectorId: start.connectorId,
          authorizeUrl: start.authorizeUrl,
        };
      }
    },
    async disconnect(connectorId: string) {
      if (local) {
        await local.disconnect(connectorId);
        return;
      }
      await http.delete(`${endpoints.connectors}?connectorId=${encodeURIComponent(connectorId)}`);
    },
    startOAuth,
    async listToolPermissions() {
      return parseConnectorToolPermissions(await http.get(endpoints.permissions));
    },
    async setToolPermission(connectorId, toolName, level) {
      await http.put(endpoints.permissions, { connectorId, toolName, level });
    },
    async resetToolPermission(connectorId, toolName) {
      await http.delete(
        `${endpoints.permissions}?connectorId=${encodeURIComponent(connectorId)}&toolName=${encodeURIComponent(toolName)}`,
      );
    },
    async addCustomConnector(input) {
      const url = input.url.trim();
      await requireConnector(input.name.trim(), { isCustom: true, url });
      return parseCustomConnector(
        await http.post(endpoints.custom, {
          name: input.name.trim(),
          url,
          ...(input.transport ? { transport: input.transport } : {}),
          ...(input.authToken?.trim() ? { authToken: input.authToken.trim() } : {}),
        }),
      );
    },
    async deleteCustomConnector(id: string) {
      await http.delete(`${endpoints.custom}?id=${encodeURIComponent(id)}`);
    },
  };
}
