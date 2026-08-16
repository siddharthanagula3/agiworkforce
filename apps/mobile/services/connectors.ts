
import { CONNECTOR_OAUTH_START_PATH } from '@agiworkforce/cloud-contracts';

import { api } from './api';
import { API_URL } from '@/lib/constants';

export function getGitHubInstallWebUrl(): string {
  return `${API_URL}/api/github/install/start`;
}

export type ConnectorSource = 'user' | 'github-app' | 'custom' | 'oauth';

const CONNECTOR_SOURCES: readonly ConnectorSource[] = ['user', 'github-app', 'custom', 'oauth'];

export interface ConnectedConnector {
  id: string;
  connectorId: string;
  authType: string;
  connectedAt: string;
  updatedAt: string;
  source: ConnectorSource;
  name?: string;
  scopes?: string[];
  needsReauthorization?: boolean;
}

export interface ConnectorDirectory {
  connectors: ConnectedConnector[];
  available: string[];
}

export type ConnectorToolPermissionLevel = 'allow' | 'ask' | 'deny';

export interface ConnectorToolPermission {
  connectorId: string;
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

export async function listConnectedConnectors(): Promise<ConnectedConnector[]> {
  return (await fetchConnectorDirectory()).connectors;
}

export interface ConnectorOAuthStart {
  connectorId: string;
  authorizeUrl: string;
}

function buildConnectorOAuthStartRequestPath(connectorId: string): string {
  return `${CONNECTOR_OAUTH_START_PATH}?connectorId=${encodeURIComponent(connectorId)}&mode=json`;
}

function isHttpsAuthorizeUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '';
  } catch {
    return false;
  }
}

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

export type ConnectConnectorResult =
  | { kind: 'connected' }
  | { kind: 'oauth-required'; connectorId: string; authorizeUrl: string };

function httpStatusOf(error: unknown): number | null {
  if (error && typeof error === 'object') {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return null;
}

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
  url: string;
  transport?: 'sse' | 'streamable-http';
  authToken?: string;
}

export interface CustomConnectorResult {
  id: string;
  shortId: string;
  name: string;
  url: string;
}

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
