/**
 * Connectors service — thin client over the web app's /api/connectors route.
 *
 * GET    /api/connectors                     → active rows + deployment availability
 * POST   /api/connectors {connectorId}       → enable an operator-mapped provider
 * DELETE /api/connectors?connectorId=<id>    → soft-disconnect
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

export interface ConnectedConnector {
  /** Row id. */
  id: string;
  /** Catalog connector id (e.g. 'github'). */
  connectorId: string;
  authType: string;
  connectedAt: string;
  updatedAt: string;
  source: 'user' | 'github-app' | 'custom';
  /** Server-owned display name for custom MCP rows. */
  name?: string;
}

export interface ConnectorDirectory {
  connectors: ConnectedConnector[];
  /** Providers this deployment can connect right now. */
  available: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseConnectedConnector(value: unknown): ConnectedConnector {
  if (!isRecord(value)) throw new Error('Invalid connectors response');
  const source = value['source'];
  if (source !== 'user' && source !== 'github-app' && source !== 'custom') {
    throw new Error('Invalid connectors response');
  }
  for (const field of ['id', 'connectorId', 'authType', 'connectedAt', 'updatedAt'] as const) {
    if (typeof value[field] !== 'string') throw new Error('Invalid connectors response');
  }
  if (value['name'] !== undefined && typeof value['name'] !== 'string') {
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
    source,
    ...(typeof value['name'] === 'string' ? { name: value['name'] } : {}),
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

/**
 * Connect a provider the server advertised in `available`. The native directory
 * never calls this for an unavailable catalog row; GitHub uses its separately
 * verified installation flow.
 */
export async function connectConnector(connectorId: string): Promise<void> {
  await api.post('/api/connectors', { connectorId });
}

export async function disconnectConnector(connectorId: string): Promise<void> {
  await api.delete(`/api/connectors?connectorId=${encodeURIComponent(connectorId)}`);
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
