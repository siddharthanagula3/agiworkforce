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
