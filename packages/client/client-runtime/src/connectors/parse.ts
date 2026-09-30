import {
  ConnectorConnectionSchema,
  ConnectorOAuthStartResponseSchema,
  ConnectorPolicyListsSchema,
  ConnectorPolicyResponseSchema,
  ConnectorToolPermissionSchema,
  CreatedCustomConnectorSchema,
  CustomConnectorSchema,
  ListConnectorToolPermissionsResponseSchema,
  ListConnectorsResponseSchema,
} from '@agiworkforce/cloud-contracts';

import type {
  ConnectedConnector,
  ConnectorAccessPolicy,
  ConnectorOAuthStart,
  ConnectorToolPermission,
  CustomConnectorResult,
} from './types';

export class ConnectorResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectorResponseError';
  }
}

const INVALID_CONNECTORS = 'Invalid connectors response';
const INVALID_PERMISSIONS = 'Invalid connector permissions response';
const INVALID_AUTHORIZATION = 'Invalid connector authorization response';
const INVALID_CUSTOM_CONNECTOR = 'Invalid custom connector response';

const ConnectorListSchema = ListConnectorsResponseSchema.pick({
  connectors: true,
  available: true,
});

const CustomConnectorResponseSchema = CreatedCustomConnectorSchema.pick({ connector: true }).extend(
  {
    connector: CustomConnectorSchema.pick({ id: true, shortId: true, name: true, url: true }),
  },
);

const policyLists = ConnectorPolicyListsSchema.shape;

const ConnectorPolicyBodySchema = ConnectorPolicyResponseSchema.pick({ configured: true })
  .partial()
  .extend({
    policy: ConnectorPolicyListsSchema.pick({
      allowedConnectors: true,
      blockedConnectors: true,
    }).extend({
      allowCustomConnectors: policyLists.allowCustomConnectors.catch(true),
      allowedPlugins: policyLists.allowedPlugins.catch([]),
      blockedPlugins: policyLists.blockedPlugins.catch([]),
      allowedMcpHosts: policyLists.allowedMcpHosts.catch([]),
    }),
  });

export function parseConnectedConnector(value: unknown): ConnectedConnector {
  const parsed = ConnectorConnectionSchema.safeParse(value);
  if (!parsed.success) throw new ConnectorResponseError(INVALID_CONNECTORS);
  return parsed.data;
}

export interface ParsedConnectorList {
  connectors: ConnectedConnector[];
  available: string[];
}

export function parseConnectorList(value: unknown): ParsedConnectorList {
  const parsed = ConnectorListSchema.safeParse(value);
  if (!parsed.success) throw new ConnectorResponseError(INVALID_CONNECTORS);
  return {
    connectors: parsed.data.connectors,
    available: [...new Set(parsed.data.available)],
  };
}

/** Absent or unreadable is ungoverned, not denied, so this never refuses. */
export function parseConnectorPolicy(value: unknown): ConnectorAccessPolicy | null {
  const parsed = ConnectorPolicyBodySchema.safeParse(value);
  if (!parsed.success || parsed.data.configured === false) return null;
  return parsed.data.policy;
}

export function parseConnectorToolPermission(value: unknown): ConnectorToolPermission {
  const parsed = ConnectorToolPermissionSchema.safeParse(value);
  if (!parsed.success) throw new ConnectorResponseError(INVALID_PERMISSIONS);
  return parsed.data;
}

export function parseConnectorToolPermissions(value: unknown): ConnectorToolPermission[] {
  const parsed = ListConnectorToolPermissionsResponseSchema.safeParse(value);
  if (!parsed.success) throw new ConnectorResponseError(INVALID_PERMISSIONS);
  return parsed.data.permissions;
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

export function parseConnectorOAuthStart(connectorId: string, value: unknown): ConnectorOAuthStart {
  const parsed = ConnectorOAuthStartResponseSchema.safeParse(value);
  if (!parsed.success || parsed.data.connectorId !== connectorId) {
    throw new ConnectorResponseError(INVALID_AUTHORIZATION);
  }
  const { authorizeUrl, appReturn } = parsed.data;
  if (!isHttpsAuthorizeUrl(authorizeUrl)) throw new ConnectorResponseError(INVALID_AUTHORIZATION);
  return { connectorId, authorizeUrl, appReturn: appReturn === true };
}

export function parseCustomConnector(value: unknown): CustomConnectorResult {
  const parsed = CustomConnectorResponseSchema.safeParse(value);
  if (!parsed.success) throw new ConnectorResponseError(INVALID_CUSTOM_CONNECTOR);
  return parsed.data.connector;
}
