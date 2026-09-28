import {
  CONNECTOR_OAUTH_START_PATH,
  CUSTOM_CONNECTORS_PATH,
  ConnectConflictResponseSchema,
  ConnectorConnectionSchema,
  ConnectorGrantedPermissionSchema,
  CreatedCustomConnectorSchema,
  CustomConnectorSchema,
  ListConnectorsResponseSchema,
  ListCustomConnectorsResponseSchema,
  MANAGED_CLOUD_CONNECTORS_PATH,
  connectorErrorMessage,
  type ConnectRequest,
  type ConnectorConnection,
  type ConnectorGrantedPermission,
  type CreateCustomConnectorRequest,
} from '@agiworkforce/cloud-contracts';
import { CLOUD_API_BASE_URL } from './cloudApi';
import { WEB_APP_URL } from './config';
import { createManagedCloudRequestContext } from '../services/managedCloudRequestContext';

export interface ListConnectorsResult {
  connectors: ConnectorConnection[];
  available: string[];
}

export type ConnectConnectorResult =
  | { status: 'connected'; connector: ConnectorConnection }
  /** GitHub (and future install-flow connectors): open `installUrl` in an owned app webview. */
  | { status: 'install-required'; installUrl: string }
  /** Server does not support connecting this id yet (501). */
  | { status: 'unsupported'; message: string };

export type CreateCustomConnectorInput = Pick<
  CreateCustomConnectorRequest,
  'name' | 'url' | 'authToken' | 'oauthClientId' | 'oauthClientSecret'
>;

export interface CreatedCustomConnector {
  id: string | null;
  shortId: string | null;
  signInRequired: boolean;
}

const CUSTOM_CONNECTOR_ID_PREFIX = 'custom-';

const ConnectorRowSchema = ConnectorConnectionSchema.pick({
  id: true,
  connectorId: true,
  authType: true,
  connectedAt: true,
  updatedAt: true,
  source: true,
  name: true,
  toolConnectorId: true,
  needsReauthorization: true,
});

const AvailableConnectorIdSchema = ListConnectorsResponseSchema.shape.available.element;

const OAuthRedirectUriSchema = ListCustomConnectorsResponseSchema.pick({ oauthRedirectUri: true });

const CreatedSchema = CreatedCustomConnectorSchema.pick({ signInRequired: true }).extend({
  connector: CustomConnectorSchema.pick({ id: true, shortId: true }),
});

function readGrantedPermissions(value: unknown): ConnectorGrantedPermission[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((permission: unknown) => {
    const parsed = ConnectorGrantedPermissionSchema.safeParse(permission);
    return parsed.success ? [parsed.data] : [];
  });
}

function parseConnectorEntry(value: unknown): ConnectorConnection | null {
  const parsed = ConnectorRowSchema.safeParse(value);
  if (!parsed.success) return null;
  const grantedPermissions = readGrantedPermissions(
    (value as Record<string, unknown>)['grantedPermissions'],
  );
  return {
    ...parsed.data,
    ...(grantedPermissions.length > 0 ? { grantedPermissions } : {}),
  };
}

function readRows<Row>(values: unknown, parse: (value: unknown) => Row | null): Row[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value: unknown) => {
    const row = parse(value);
    return row === null ? [] : [row];
  });
}

function readAvailableId(value: unknown): string | null {
  const parsed = AvailableConnectorIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function customConnectorShortId(entry: ConnectorConnection): string | null {
  const toolId = entry.toolConnectorId;
  return toolId?.startsWith(CUSTOM_CONNECTOR_ID_PREFIX)
    ? toolId.slice(CUSTOM_CONNECTOR_ID_PREFIX.length)
    : null;
}

export function customConnectorSignInUrl(shortId: string): string {
  const connectorId = `${CUSTOM_CONNECTOR_ID_PREFIX}${shortId}`;
  return `${WEB_APP_URL}${CONNECTOR_OAUTH_START_PATH}?connectorId=${encodeURIComponent(connectorId)}`;
}

export async function getCustomConnectorOAuthRedirectUri(): Promise<string | null> {
  const request = createManagedCloudRequestContext('Custom Cloud connector settings');
  const headers = await request.getHeaders();
  const res = await request.fetch(`${CLOUD_API_BASE_URL}${CUSTOM_CONNECTORS_PATH}`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) return null;
  const data: unknown = await res.json().catch(() => null);
  request.assertBoundary();
  const parsed = OAuthRedirectUriSchema.safeParse(data);
  return parsed.success ? (parsed.data.oauthRedirectUri ?? null) : null;
}

export async function listConnectors(): Promise<ListConnectorsResult> {
  const request = createManagedCloudRequestContext('Cloud connectors');
  const headers = await request.getHeaders();

  const res = await request.fetch(`${CLOUD_API_BASE_URL}${MANAGED_CLOUD_CONNECTORS_PATH}`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to list connectors: HTTP ${res.status}`);
  }

  const data: unknown = await res.json();
  request.assertBoundary();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The cloud connector service returned an invalid response.');
  }
  const record = data as Record<string, unknown>;
  return {
    connectors: readRows(record['connectors'], parseConnectorEntry),
    available: readRows(record['available'], readAvailableId),
  };
}

export async function connectConnector(
  connectorId: string,
  authType?: string,
): Promise<ConnectConnectorResult> {
  const request = createManagedCloudRequestContext('Cloud connector connection');
  const headers = await request.getHeaders();

  const connectRequest: ConnectRequest = { connectorId, ...(authType ? { authType } : {}) };
  const res = await request.fetch(`${CLOUD_API_BASE_URL}${MANAGED_CLOUD_CONNECTORS_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(connectRequest),
  });

  if (res.status === 201) {
    const payload: unknown = await res.json();
    request.assertBoundary();
    const connector =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? parseConnectorEntry((payload as Record<string, unknown>)['connector'])
        : null;
    if (!connector) {
      throw new Error('The cloud connector service returned an invalid connection.');
    }
    return { status: 'connected', connector };
  }

  if (res.status === 409) {
    const payload: unknown = await res.json().catch(() => null);
    request.assertBoundary();
    const conflict = ConnectConflictResponseSchema.safeParse(payload);
    const installStartPath = conflict.success ? conflict.data.installStartPath : undefined;
    if (installStartPath) {
      return {
        status: 'install-required',
        installUrl: `${CLOUD_API_BASE_URL}${installStartPath}`,
      };
    }
    throw new Error(
      'This connector requires an install flow that is not configured on the server.',
    );
  }

  if (res.status === 501) {
    const payload: unknown = await res.json().catch(() => null);
    request.assertBoundary();
    return {
      status: 'unsupported',
      message: connectorErrorMessage(payload, 'This connector is not available yet.'),
    };
  }

  const body: unknown = await res.json().catch(() => null);
  request.assertBoundary();
  throw new Error(connectorErrorMessage(body, `Failed to connect connector: HTTP ${res.status}`));
}

export async function disconnectConnector(connectorId: string): Promise<void> {
  const request = createManagedCloudRequestContext('Cloud connector disconnection');
  const headers = await request.getHeaders();

  const res = await request.fetch(
    `${CLOUD_API_BASE_URL}${MANAGED_CLOUD_CONNECTORS_PATH}?connectorId=${encodeURIComponent(connectorId)}`,
    {
      method: 'DELETE',
      headers,
    },
  );

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    request.assertBoundary();
    throw new Error(
      connectorErrorMessage(body, `Failed to disconnect connector: HTTP ${res.status}`),
    );
  }
  request.assertBoundary();
}

export async function createCustomConnector(
  input: CreateCustomConnectorInput,
): Promise<CreatedCustomConnector> {
  const request = createManagedCloudRequestContext('Custom Cloud connector creation');
  const headers = await request.getHeaders();
  const authToken = input.authToken?.trim();
  const oauthClientId = input.oauthClientId?.trim();
  const oauthClientSecret = input.oauthClientSecret?.trim();
  const createRequest: CreateCustomConnectorRequest = {
    name: input.name,
    url: input.url,
    ...(authToken ? { authToken } : {}),
    ...(oauthClientId ? { oauthClientId } : {}),
    ...(oauthClientId && oauthClientSecret ? { oauthClientSecret } : {}),
  };
  const res = await request.fetch(`${CLOUD_API_BASE_URL}${CUSTOM_CONNECTORS_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(createRequest),
  });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    request.assertBoundary();
    throw new Error(connectorErrorMessage(body, `Failed to add connector: HTTP ${res.status}`));
  }
  const payload: unknown = await res.json().catch(() => null);
  request.assertBoundary();
  const created = CreatedSchema.safeParse(payload);
  if (!created.success) return { id: null, shortId: null, signInRequired: false };
  return {
    id: created.data.connector.id,
    shortId: created.data.connector.shortId,
    signInRequired: created.data.signInRequired === true,
  };
}

export async function deleteCustomConnector(id: string): Promise<void> {
  const request = createManagedCloudRequestContext('Custom Cloud connector deletion');
  const headers = await request.getHeaders();
  const res = await request.fetch(
    `${CLOUD_API_BASE_URL}${CUSTOM_CONNECTORS_PATH}?id=${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers,
    },
  );
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    request.assertBoundary();
    throw new Error(connectorErrorMessage(body, `Failed to remove connector: HTTP ${res.status}`));
  }
  request.assertBoundary();
}
