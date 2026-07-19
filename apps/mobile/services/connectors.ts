/**
 * Connectors service — thin client over the web app's /api/connectors route.
 *
 * GET    /api/connectors                     → list the user's active connections
 * POST   /api/connectors {connectorId}       → returns 501 for OAuth providers
 *                                              (server-side OAuth flows are not
 *                                              implemented yet — tracked gap)
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
}

interface ListConnectorsResponse {
  connectors: ConnectedConnector[];
}

export async function listConnectedConnectors(): Promise<ConnectedConnector[]> {
  const response = await api.get<ListConnectorsResponse>('/api/connectors');
  return response.connectors ?? [];
}

/**
 * Attempt to connect a provider. For OAuth providers the server currently
 * responds 501 ("authorization is not implemented for this provider"), which
 * surfaces here as a thrown Error with the server's message — callers show
 * honest not-yet-available copy instead of faking a connection.
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
