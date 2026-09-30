export const CONNECTOR_SURFACES = ['web', 'mobile', 'desktop', 'cli', 'extension'] as const;
export type ConnectorSurface = (typeof CONNECTOR_SURFACES)[number];

import type {
  ConnectorConnection,
  CreateCustomConnectorRequest,
  CustomConnector,
} from '@agiworkforce/cloud-contracts';
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

export type ConnectedConnector = ConnectorConnection;

export type { ConnectorToolPermission } from '@agiworkforce/cloud-contracts';

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
  appReturn: boolean;
}

export type ConnectResult =
  | { kind: 'connected' }
  | { kind: 'oauth-required'; connectorId: string; authorizeUrl: string; appReturn: boolean }
  | { kind: 'install-required'; connectorId: string; installUrl: string }
  | { kind: 'credentials-required'; connectorId: string; credentialsPath: string };

export type AddCustomConnectorInput = Pick<
  CreateCustomConnectorRequest,
  'name' | 'url' | 'transport' | 'authToken'
>;

export type CustomConnectorResult = Pick<CustomConnector, 'id' | 'shortId' | 'name' | 'url'>;
