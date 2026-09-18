export const CONNECTOR_SURFACES = ['web', 'mobile', 'desktop', 'cli', 'extension'] as const;
export type ConnectorSurface = (typeof CONNECTOR_SURFACES)[number];

export const CONNECTOR_SOURCES = ['user', 'github-app', 'custom', 'oauth'] as const;
export type ConnectorSource = (typeof CONNECTOR_SOURCES)[number];

export const CONNECTOR_HEALTH_STATES = [
  'connected',
  'connectable',
  'needs-reauthorization',
  'not-responding',
  'not-configured',
  'unsupported-here',
] as const;
export type ConnectorHealth = (typeof CONNECTOR_HEALTH_STATES)[number];

export const CONNECTOR_TOOL_PERMISSION_LEVELS = ['allow', 'ask', 'deny'] as const;
export type ConnectorToolPermissionLevel = (typeof CONNECTOR_TOOL_PERMISSION_LEVELS)[number];

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
