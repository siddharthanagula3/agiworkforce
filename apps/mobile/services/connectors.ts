import {
  ConnectorPolicyError,
  connectorEndpoints,
  createConnectorRuntime,
  type AddCustomConnectorInput,
  type ConnectResult,
  type ConnectedConnector,
  type ConnectorDirectory,
  type ConnectorOAuthStart,
  type ConnectorToolPermission,
  type ConnectorToolPermissionLevel,
  type CustomConnectorResult,
} from '@agiworkforce/client-runtime';
import {
  CONNECTOR_OAUTH_START_PATH,
  MANAGED_CLOUD_CONNECTORS_PATH,
} from '@agiworkforce/cloud-contracts';

import { api } from './api';
import { API_URL } from '@/lib/constants';

export { ConnectorPolicyError };
export type {
  AddCustomConnectorInput,
  ConnectedConnector,
  ConnectorDirectory,
  ConnectorOAuthStart,
  ConnectorToolPermission,
  ConnectorToolPermissionLevel,
  CustomConnectorResult,
};
export type ConnectorSource = ConnectedConnector['source'];
export type ConnectConnectorResult = Exclude<ConnectResult, { kind: 'install-required' }>;

export function getGitHubInstallWebUrl(): string {
  return `${API_URL}/api/github/install/start`;
}

const runtime = createConnectorRuntime({
  surface: 'mobile',
  endpoints: connectorEndpoints({
    connectors: MANAGED_CLOUD_CONNECTORS_PATH,
    oauthStart: CONNECTOR_OAUTH_START_PATH,
  }),
  http: {
    get: (path) => api.get<unknown>(path),
    post: (path, body) => api.post<unknown>(path, body),
    put: (path, body) => api.put<unknown>(path, body),
    delete: (path) => api.delete<unknown>(path),
  },
});

export function invalidateConnectorPolicy(): void {
  runtime.invalidatePolicy();
}

export async function fetchConnectorDirectory(): Promise<ConnectorDirectory> {
  return runtime.loadDirectory();
}

export async function listConnectedConnectors(): Promise<ConnectedConnector[]> {
  return runtime.listConnected();
}

export async function startConnectorOAuth(connectorId: string): Promise<ConnectorOAuthStart> {
  return runtime.startOAuth(connectorId);
}

export async function connectConnector(connectorId: string): Promise<ConnectConnectorResult> {
  const result = await runtime.connect(connectorId);
  if (result.kind !== 'install-required') return result;
  return {
    kind: 'oauth-required',
    connectorId: result.connectorId,
    authorizeUrl: new URL(result.installUrl, API_URL).toString(),
  };
}

export async function disconnectConnector(connectorId: string): Promise<void> {
  await runtime.disconnect(connectorId);
}

export async function fetchConnectorToolPermissions(): Promise<ConnectorToolPermission[]> {
  return runtime.listToolPermissions();
}

export async function setConnectorToolPermission(
  connectorId: string,
  toolName: string,
  level: ConnectorToolPermissionLevel,
): Promise<void> {
  await runtime.setToolPermission(connectorId, toolName, level);
}

export async function resetConnectorToolPermission(
  connectorId: string,
  toolName: string,
): Promise<void> {
  await runtime.resetToolPermission(connectorId, toolName);
}

export async function addCustomConnector(
  input: AddCustomConnectorInput,
): Promise<CustomConnectorResult> {
  return runtime.addCustomConnector(input);
}

export async function deleteCustomConnector(id: string): Promise<void> {
  await runtime.deleteCustomConnector(id);
}
