
import { CLOUD_API_BASE_URL } from './cloudApi';
import { createManagedCloudRequestContext } from '../services/managedCloudRequestContext';

export interface CloudConnectorEntry {
  id: string;
  connectorId: string;
  authType: string;
  connectedAt: string;
  updatedAt: string;
  source: 'user' | 'github-app' | 'custom';
  name?: string;
}

export interface ListConnectorsResult {
  connectors: CloudConnectorEntry[];
  available: string[];
}

export type ConnectConnectorResult =
  | { status: 'connected'; connector: CloudConnectorEntry }
  /** GitHub (and future install-flow connectors): open `installUrl` in an owned app webview. */
  | { status: 'install-required'; installUrl: string }
  /** Server does not support connecting this id yet (501). */
  | { status: 'unsupported'; message: string };

export interface CreateCustomConnectorInput {
  name: string;
  url: string;
  authToken?: string;
}

function readApiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fallback;
  const record = body as Record<string, unknown>;
  if (typeof record['error'] === 'string') return record['error'];
  const nested = record['error'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const message = (nested as Record<string, unknown>)['message'];
    if (typeof message === 'string') return message;
  }
  if (typeof record['message'] === 'string') return record['message'];
  return fallback;
}

function parseConnectorEntry(value: unknown): CloudConnectorEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record['id'] !== 'string' ||
    typeof record['connectorId'] !== 'string' ||
    typeof record['authType'] !== 'string' ||
    typeof record['connectedAt'] !== 'string' ||
    typeof record['updatedAt'] !== 'string' ||
    (record['source'] !== 'user' &&
      record['source'] !== 'github-app' &&
      record['source'] !== 'custom')
  ) {
    return null;
  }
  return {
    id: record['id'],
    connectorId: record['connectorId'],
    authType: record['authType'],
    connectedAt: record['connectedAt'],
    updatedAt: record['updatedAt'],
    source: record['source'],
    ...(typeof record['name'] === 'string' ? { name: record['name'] } : {}),
  };
}

export async function listConnectors(): Promise<ListConnectorsResult> {
  const request = createManagedCloudRequestContext('Cloud connectors');
  const headers = await request.getHeaders();

  const res = await request.fetch(`${CLOUD_API_BASE_URL}/api/connectors`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to list connectors: HTTP ${res.status}`);
  }

  const data = await res.json();
  request.assertBoundary();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The cloud connector service returned an invalid response.');
  }
  const record = data as Record<string, unknown>;
  const connectors = Array.isArray(record['connectors'])
    ? record['connectors'].map(parseConnectorEntry).filter((entry) => entry !== null)
    : [];
  const available = Array.isArray(record['available'])
    ? record['available'].filter((id): id is string => typeof id === 'string')
    : [];
  return { connectors, available };
}

export async function connectConnector(
  connectorId: string,
  authType?: string,
): Promise<ConnectConnectorResult> {
  const request = createManagedCloudRequestContext('Cloud connector connection');
  const headers = await request.getHeaders();

  const res = await request.fetch(`${CLOUD_API_BASE_URL}/api/connectors`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ connectorId, ...(authType ? { authType } : {}) }),
  });

  if (res.status === 201) {
    const payload: unknown = await res.json();
    request.assertBoundary();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('The cloud connector service returned an invalid connection.');
    }
    const data = payload as Record<string, unknown>;
    const connector = parseConnectorEntry(data['connector']);
    if (!connector) {
      throw new Error('The cloud connector service returned an invalid connection.');
    }
    return { status: 'connected', connector };
  }

  if (res.status === 409) {
    const payload: unknown = await res.json().catch(() => null);
    request.assertBoundary();
    const installStartPath =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)['installStartPath']
        : undefined;
    if (typeof installStartPath === 'string') {
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
      message: readApiError(payload, 'This connector is not available yet.'),
    };
  }

  const body = await res.json().catch(() => null);
  request.assertBoundary();
  throw new Error(readApiError(body, `Failed to connect connector: HTTP ${res.status}`));
}

export async function disconnectConnector(connectorId: string): Promise<void> {
  const request = createManagedCloudRequestContext('Cloud connector disconnection');
  const headers = await request.getHeaders();

  const res = await request.fetch(
    `${CLOUD_API_BASE_URL}/api/connectors?connectorId=${encodeURIComponent(connectorId)}`,
    {
      method: 'DELETE',
      headers,
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    request.assertBoundary();
    throw new Error(readApiError(body, `Failed to disconnect connector: HTTP ${res.status}`));
  }
  request.assertBoundary();
}

export async function createCustomConnector(input: CreateCustomConnectorInput): Promise<void> {
  const request = createManagedCloudRequestContext('Custom Cloud connector creation');
  const headers = await request.getHeaders();
  const authToken = input.authToken?.trim();
  const res = await request.fetch(`${CLOUD_API_BASE_URL}/api/connectors/custom`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: input.name,
      url: input.url,
      ...(authToken ? { authToken } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    request.assertBoundary();
    throw new Error(readApiError(body, `Failed to add connector: HTTP ${res.status}`));
  }
  request.assertBoundary();
}

export async function deleteCustomConnector(id: string): Promise<void> {
  const request = createManagedCloudRequestContext('Custom Cloud connector deletion');
  const headers = await request.getHeaders();
  const res = await request.fetch(
    `${CLOUD_API_BASE_URL}/api/connectors/custom?id=${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers,
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    request.assertBoundary();
    throw new Error(readApiError(body, `Failed to remove connector: HTTP ${res.status}`));
  }
  request.assertBoundary();
}
