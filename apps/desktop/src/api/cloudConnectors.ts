/**
 * Cloud Connectors API Client
 *
 * HTTP client for web's real connectors API (GET/POST/DELETE /api/connectors —
 * see apps/web/app/api/connectors/route.ts), used by DesktopCloudSettingsModal
 * so the CLOUD-mode connectors panel reflects server truth instead of driving
 * local Tauri MCP connector state.
 *
 * Auth/CSRF plumbing mirrors apps/desktop/src/api/cloudApi.ts — this module
 * imports its exported `getAuthHeaders`/`CLOUD_API_BASE_URL` rather than
 * duplicating them, so that file stays the single source of truth for how
 * desktop attaches the Bearer session token (and, in the cookie-session
 * fallback, an X-CSRF-Token). A valid Bearer JWT is enough on its own: the web
 * route's `requireCsrfToken` bypasses CSRF for any request whose Bearer token
 * verifies against Clerk (apps/web/lib/csrf.ts, `isBearerTokenValid`), which is
 * the case for every authenticated desktop cloud-mode request.
 */

import { guardedFetch } from '../lib/egressGuard';
import { getAuthHeaders, CLOUD_API_BASE_URL } from './cloudApi';

// ============================================================================
// Type Definitions
// ============================================================================

/** Mirrors the `ConnectorEntry` shape returned by GET /api/connectors. */
export interface CloudConnectorEntry {
  id: string;
  connectorId: string;
  authType: string;
  connectedAt: string;
  updatedAt: string;
  source: 'user' | 'github-app';
}

export interface ListConnectorsResult {
  /** Connectors this user currently has connected server-side. */
  connectors: CloudConnectorEntry[];
  /** Connector ids that can actually be connected in this deployment. */
  available: string[];
}

export type ConnectConnectorResult =
  | { status: 'connected'; connector: CloudConnectorEntry }
  /** github (and any future install-flow connector): open `installUrl` in the system browser. */
  | { status: 'install-required'; installUrl: string }
  /** Server does not support connecting this id yet (501). */
  | { status: 'unsupported'; message: string };

// ============================================================================
// API
// ============================================================================

/**
 * Lists this user's connected services plus the ids connectable in this
 * deployment (`available`), so callers can gate "Connect" on real capability
 * instead of static catalog data.
 */
export async function listConnectors(): Promise<ListConnectorsResult> {
  const headers = await getAuthHeaders();

  const res = await guardedFetch(`${CLOUD_API_BASE_URL}/api/connectors`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to list connectors: HTTP ${res.status}`);
  }

  const data = (await res.json()) as Partial<ListConnectorsResult>;
  return { connectors: data.connectors ?? [], available: data.available ?? [] };
}

/**
 * Connects a connector server-side. Returns a discriminated result rather than
 * throwing for the two well-known non-error outcomes (github's install-flow
 * redirect, and connectors the server does not support yet) so callers can
 * react appropriately instead of treating them as failures.
 */
export async function connectConnector(
  connectorId: string,
  authType?: string,
): Promise<ConnectConnectorResult> {
  const headers = await getAuthHeaders();

  const res = await guardedFetch(`${CLOUD_API_BASE_URL}/api/connectors`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ connectorId, ...(authType ? { authType } : {}) }),
  });

  if (res.status === 201) {
    const data = (await res.json()) as { connector: CloudConnectorEntry };
    return { status: 'connected', connector: data.connector };
  }

  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { installStartPath?: string };
    if (body.installStartPath) {
      return {
        status: 'install-required',
        installUrl: `${CLOUD_API_BASE_URL}${body.installStartPath}`,
      };
    }
    throw new Error(
      'This connector requires an install flow that is not configured on the server.',
    );
  }

  if (res.status === 501) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { status: 'unsupported', message: body.error ?? 'This connector is not available yet.' };
  }

  throw new Error(`Failed to connect connector: HTTP ${res.status}`);
}

/** Disconnects a connector server-side (soft-delete / unlink). */
export async function disconnectConnector(connectorId: string): Promise<void> {
  const headers = await getAuthHeaders();

  const res = await guardedFetch(
    `${CLOUD_API_BASE_URL}/api/connectors?connectorId=${encodeURIComponent(connectorId)}`,
    {
      method: 'DELETE',
      headers,
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to disconnect connector: HTTP ${res.status}`);
  }
}
