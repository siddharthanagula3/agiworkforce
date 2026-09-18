import {
  CONNECTOR_HEALTH_STATES,
  CONNECTOR_SOURCES,
  CONNECTOR_TOOL_PERMISSION_LEVELS,
  type ConnectedConnector,
  type ConnectorAccessPolicy,
  type ConnectorHealth,
  type ConnectorOAuthStart,
  type ConnectorSource,
  type ConnectorToolPermission,
  type ConnectorToolPermissionLevel,
  type CustomConnectorResult,
} from './types';

export class ConnectorResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectorResponseError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArrayOrNull(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((entry) => typeof entry === 'string') ? [...(value as string[])] : null;
}

export function parseConnectedConnector(value: unknown): ConnectedConnector {
  if (!isRecord(value)) throw new ConnectorResponseError('Invalid connectors response');
  const source = value['source'];
  if (!CONNECTOR_SOURCES.includes(source as ConnectorSource)) {
    throw new ConnectorResponseError('Invalid connectors response');
  }
  for (const field of ['id', 'connectorId', 'authType', 'connectedAt', 'updatedAt'] as const) {
    if (typeof value[field] !== 'string') {
      throw new ConnectorResponseError('Invalid connectors response');
    }
  }
  for (const field of ['name', 'toolConnectorId'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      throw new ConnectorResponseError('Invalid connectors response');
    }
  }
  const scopes = value['scopes'];
  if (scopes !== undefined && stringArrayOrNull(scopes) === null) {
    throw new ConnectorResponseError('Invalid connectors response');
  }
  const needsReauthorization = value['needsReauthorization'];
  if (needsReauthorization !== undefined && typeof needsReauthorization !== 'boolean') {
    throw new ConnectorResponseError('Invalid connectors response');
  }
  const health = value['health'];
  if (health !== undefined && !CONNECTOR_HEALTH_STATES.includes(health as ConnectorHealth)) {
    throw new ConnectorResponseError('Invalid connectors response');
  }
  return {
    id: value['id'] as string,
    connectorId: value['connectorId'] as string,
    authType: value['authType'] as string,
    connectedAt: value['connectedAt'] as string,
    updatedAt: value['updatedAt'] as string,
    source: source as ConnectorSource,
    ...(typeof value['name'] === 'string' ? { name: value['name'] } : {}),
    ...(typeof value['toolConnectorId'] === 'string'
      ? { toolConnectorId: value['toolConnectorId'] }
      : {}),
    ...(Array.isArray(scopes) ? { scopes: scopes as string[] } : {}),
    ...(typeof needsReauthorization === 'boolean' ? { needsReauthorization } : {}),
    ...(typeof health === 'string' ? { health: health as ConnectorHealth } : {}),
  };
}

export interface ParsedConnectorList {
  connectors: ConnectedConnector[];
  available: string[];
}

export function parseConnectorList(value: unknown): ParsedConnectorList {
  if (!isRecord(value) || !Array.isArray(value['connectors'])) {
    throw new ConnectorResponseError('Invalid connectors response');
  }
  const available = stringArrayOrNull(value['available']);
  if (available === null) throw new ConnectorResponseError('Invalid connectors response');
  return {
    connectors: value['connectors'].map(parseConnectedConnector),
    available: [...new Set(available)],
  };
}

/** Absent or unreadable is ungoverned, not denied, so this never refuses. */
export function parseConnectorPolicy(value: unknown): ConnectorAccessPolicy | null {
  if (!isRecord(value)) return null;
  if (value['configured'] === false) return null;
  const policy = value['policy'];
  if (!isRecord(policy)) return null;
  const allowedConnectors = stringArrayOrNull(policy['allowedConnectors']);
  const blockedConnectors = stringArrayOrNull(policy['blockedConnectors']);
  if (allowedConnectors === null || blockedConnectors === null) return null;
  return {
    allowedConnectors,
    blockedConnectors,
    allowCustomConnectors: policy['allowCustomConnectors'] !== false,
    allowedPlugins: stringArrayOrNull(policy['allowedPlugins']) ?? [],
    blockedPlugins: stringArrayOrNull(policy['blockedPlugins']) ?? [],
    allowedMcpHosts: stringArrayOrNull(policy['allowedMcpHosts']) ?? [],
  };
}

export function parseConnectorToolPermission(value: unknown): ConnectorToolPermission {
  if (!isRecord(value)) throw new ConnectorResponseError('Invalid connector permissions response');
  const connectorId = value['connectorId'];
  const toolName = value['toolName'];
  const level = value['level'];
  if (
    typeof connectorId !== 'string' ||
    connectorId.length === 0 ||
    typeof toolName !== 'string' ||
    toolName.length === 0 ||
    !CONNECTOR_TOOL_PERMISSION_LEVELS.includes(level as ConnectorToolPermissionLevel)
  ) {
    throw new ConnectorResponseError('Invalid connector permissions response');
  }
  return { connectorId, toolName, level: level as ConnectorToolPermissionLevel };
}

export function parseConnectorToolPermissions(value: unknown): ConnectorToolPermission[] {
  if (!isRecord(value) || !Array.isArray(value['permissions'])) {
    throw new ConnectorResponseError('Invalid connector permissions response');
  }
  return value['permissions'].map(parseConnectorToolPermission);
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
  if (!isRecord(value) || value['connectorId'] !== connectorId) {
    throw new ConnectorResponseError('Invalid connector authorization response');
  }
  const authorizeUrl = value['authorizeUrl'];
  if (!isHttpsAuthorizeUrl(authorizeUrl)) {
    throw new ConnectorResponseError('Invalid connector authorization response');
  }
  return { connectorId, authorizeUrl };
}

export function parseCustomConnector(value: unknown): CustomConnectorResult {
  const connector = isRecord(value) ? value['connector'] : null;
  if (!isRecord(connector)) {
    throw new ConnectorResponseError('Invalid custom connector response');
  }
  for (const field of ['id', 'shortId', 'name', 'url'] as const) {
    if (typeof connector[field] !== 'string') {
      throw new ConnectorResponseError('Invalid custom connector response');
    }
  }
  return {
    id: connector['id'] as string,
    shortId: connector['shortId'] as string,
    name: connector['name'] as string,
    url: connector['url'] as string,
  };
}
