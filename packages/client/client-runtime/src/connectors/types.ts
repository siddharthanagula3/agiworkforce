export const CONNECTOR_SURFACES = ['web', 'mobile', 'desktop', 'cli', 'extension'] as const;
export type ConnectorSurface = (typeof CONNECTOR_SURFACES)[number];

import type {
  ConnectorHealthState,
  ConnectorSource,
  ConnectorToolPermissionLevel,
} from '@agiworkforce/types';

export {
  CONNECTOR_HEALTH_STATES,
  CONNECTOR_SOURCES,
  CONNECTOR_TOOL_PERMISSION_LEVELS,
} from '@agiworkforce/types';
export type { ConnectorSource, ConnectorToolPermissionLevel };
export type ConnectorHealth = ConnectorHealthState;

export interface ConnectedConnector {
  id: string;
  connectorId: string;
  authType: string;
  connectedAt: string;
  updatedAt: string;
  source: ConnectorSource;
  name?: string;
  toolConnectorId?: string;
  scopes?: string[];
  needsReauthorization?: boolean;
  health?: ConnectorHealth;
}

export interface ConnectorToolPermission {
  connectorId: string;
  toolName: string;
  level: ConnectorToolPermissionLevel;
}

export interface ConnectorDirectoryEntry {
  connectorId: string;
  connection: ConnectedConnector | null;
  available: boolean;
  access: ConnectorAccessDecision;
}

export interface ConnectorDirectory {
  connectors: ConnectedConnector[];
  available: string[];
  entries: ConnectorDirectoryEntry[];
  policy: ConnectorAccessPolicy | null;
}

export interface ConnectorAccessPolicy {
  allowedConnectors: string[];
  blockedConnectors: string[];
  allowCustomConnectors: boolean;
  allowedPlugins?: string[];
  blockedPlugins?: string[];
  allowedMcpHosts?: string[];
}

export type ConnectorAccessCode =
  | 'allowed'
  | 'ungoverned'
  | 'connector_blocked'
  | 'connector_not_allowed'
  | 'custom_connectors_disabled'
  | 'mcp_host_not_allowed'
  | 'plugin_blocked'
  | 'plugin_not_allowed';

export interface ConnectorAccessDecision {
  allowed: boolean;
  code: ConnectorAccessCode;
  reason: string;
}

export interface ConnectorOAuthStart {
  connectorId: string;
  authorizeUrl: string;
}

export type ConnectResult =
  | { kind: 'connected' }
  | { kind: 'oauth-required'; connectorId: string; authorizeUrl: string }
  | { kind: 'install-required'; connectorId: string; installUrl: string };

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
