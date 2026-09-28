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
export type ConnectorHealthState = (typeof CONNECTOR_HEALTH_STATES)[number];

export const CONNECTOR_TOOL_PERMISSION_LEVELS = ['allow', 'ask', 'deny'] as const;
export type ConnectorToolPermissionLevel = (typeof CONNECTOR_TOOL_PERMISSION_LEVELS)[number];
