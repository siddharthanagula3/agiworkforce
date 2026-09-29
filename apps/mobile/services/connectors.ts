import {
  ConnectorPolicyError,
  ConnectorResponseError,
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
  CONNECTOR_DIRECTORY_MAX_LIMIT,
  CONNECTOR_DIRECTORY_PATH,
  CONNECTOR_OAUTH_START_PATH,
  ConnectorCapabilityCatalogSchema,
  ConnectorCredentialStatusResponseSchema,
  ConnectorDirectoryEntryResponseSchema,
  ConnectorDirectoryListResponseSchema,
  MANAGED_CLOUD_CONNECTORS_PATH,
  SaveConnectorCredentialResponseSchema,
  connectorCapabilitiesPath,
  connectorDirectoryEntryPath,
  connectorDirectoryIconPath,
  type ConnectorCapabilityCatalog,
  type ConnectorCredentialStatusResponse,
  type ConnectorDirectoryCategory,
  type ConnectorDirectoryEntry,
  type ConnectorDirectoryListResponse,
  type ConnectorDirectoryQuery,
  type SaveConnectorCredentialRequest,
} from '@agiworkforce/cloud-contracts';

import { api } from './api';
import { ApiHttpError } from './apiErrors';
import { API_URL } from '@/lib/constants';

export { ConnectorPolicyError };
export type {
  AddCustomConnectorInput,
  ConnectedConnector,
  ConnectorCapabilityCatalog,
  ConnectorCredentialStatusResponse,
  ConnectorDirectory,
  ConnectorOAuthStart,
  ConnectorToolPermission,
  ConnectorToolPermissionLevel,
  CustomConnectorResult,
};
export type ConnectorSource = ConnectedConnector['source'];
export type ConnectConnectorResult = Exclude<ConnectResult, { kind: 'install-required' }>;
export type ConnectorListing = ConnectorDirectoryEntry;
export type ConnectorListingCategory = ConnectorDirectoryCategory;
export type ConnectorListingPage = Pick<
  ConnectorDirectoryListResponse,
  'entries' | 'nextCursor' | 'categories'
>;

export interface ConnectorListingFilter {
  search?: string;
  category?: ConnectorListingCategory | null;
  cursor?: string | null;
}

const INVALID_LISTING = 'Invalid connector directory response';
const INVALID_CAPABILITIES = 'Invalid connector tools response';
const INVALID_CREDENTIALS = 'Invalid connector key response';

const ListingPageSchema = ConnectorDirectoryListResponseSchema.pick({
  entries: true,
  nextCursor: true,
  categories: true,
});

const SavedCredentialSchema = SaveConnectorCredentialResponseSchema.pick({ toolCount: true });

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

function listingHref(filter: ConnectorListingFilter): string {
  const params = new URLSearchParams();
  const set = (key: keyof ConnectorDirectoryQuery, value: string | null | undefined) => {
    if (value) params.set(key, value);
  };
  set('connectableOnly', 'true');
  set('limit', String(CONNECTOR_DIRECTORY_MAX_LIMIT));
  set('search', filter.search?.trim());
  set('category', filter.category);
  set('cursor', filter.cursor);
  return `${CONNECTOR_DIRECTORY_PATH}?${params.toString()}`;
}

export async function browseConnectorListings(
  filter: ConnectorListingFilter,
): Promise<ConnectorListingPage> {
  const parsed = ListingPageSchema.safeParse(await api.get<unknown>(listingHref(filter)));
  if (!parsed.success) throw new ConnectorResponseError(INVALID_LISTING);
  return parsed.data;
}

export async function fetchConnectorListing(id: string): Promise<ConnectorListing | null> {
  let body: unknown;
  try {
    body = await api.get<unknown>(connectorDirectoryEntryPath(id));
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 404) return null;
    throw error;
  }
  const parsed = ConnectorDirectoryEntryResponseSchema.safeParse(body);
  if (!parsed.success) throw new ConnectorResponseError(INVALID_LISTING);
  return parsed.data.entry;
}

export function connectorListingIconUrl(listing: ConnectorListing): string | null {
  return listing.iconUrl ? `${API_URL}${connectorDirectoryIconPath(listing.id)}` : null;
}

export async function fetchConnectorCapabilities(
  connectorId: string,
): Promise<ConnectorCapabilityCatalog> {
  const parsed = ConnectorCapabilityCatalogSchema.safeParse(
    await api.get<unknown>(connectorCapabilitiesPath(connectorId)),
  );
  if (!parsed.success) throw new ConnectorResponseError(INVALID_CAPABILITIES);
  return parsed.data;
}

export async function fetchConnectorCredentialStatus(
  credentialsPath: string,
): Promise<ConnectorCredentialStatusResponse> {
  const parsed = ConnectorCredentialStatusResponseSchema.safeParse(
    await api.get<unknown>(credentialsPath),
  );
  if (!parsed.success) throw new ConnectorResponseError(INVALID_CREDENTIALS);
  return parsed.data;
}

export async function saveConnectorApiKey(credentialsPath: string, apiKey: string): Promise<void> {
  const parsed = SavedCredentialSchema.safeParse(
    await api.post<unknown>(credentialsPath, {
      apiKey: apiKey.trim(),
    } satisfies SaveConnectorCredentialRequest),
  );
  if (!parsed.success) throw new ConnectorResponseError(INVALID_CREDENTIALS);
}
