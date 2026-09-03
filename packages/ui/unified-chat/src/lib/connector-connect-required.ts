export const CONNECTOR_AUTHORIZATION_REQUIRED_KEY = 'agi_connector_authorization_required';

export const CONNECTOR_OAUTH_START_PATH = '/api/connectors/oauth/start';

export type ConnectorAuthorizationReason =
  | 'not_connected'
  | 'authorization_expired'
  | 'insufficient_scope'
  | 'authorization_unavailable';

const REASONS: readonly ConnectorAuthorizationReason[] = [
  'not_connected',
  'authorization_expired',
  'insufficient_scope',
  'authorization_unavailable',
];

const CONNECTOR_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const MAX_CONNECTOR_NAME_LENGTH = 120;

const MAX_SCOPES = 256;
const MAX_SCOPE_LENGTH = 512;

const MAX_RETURN_PATH_LENGTH = 512;

export interface ConnectorConnectRequest {
  connectorId: string;
  connectorName: string;
  toolName: string;
  qualifiedToolName: string;
  reason: ConnectorAuthorizationReason;
  connectUrl: string | null;
  scopes: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRelativeSameOriginPath(value: string): boolean {
  return /^\/[^/\\]/.test(value);
}

function isTrustedConnectUrl(value: string, connectorId: string): boolean {
  if (value.length > 2048) return false;
  if (!isRelativeSameOriginPath(value)) return false;
  const base = 'https://connector-connect-url.invalid';
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return false;
  }
  if (url.origin !== base) return false;
  if (url.pathname !== CONNECTOR_OAUTH_START_PATH) return false;
  return url.searchParams.get('connectorId') === connectorId;
}

function readScopes(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_SCOPES) return null;
  const scopes: string[] = [];
  for (const scope of value) {
    if (typeof scope !== 'string') return null;
    if (scope.length > MAX_SCOPE_LENGTH) return null;
    const trimmed = scope.trim();
    if (trimmed.length > 0) scopes.push(trimmed);
  }
  return scopes;
}

export function readConnectorConnectRequest(params: {
  qualifiedToolName: string;
  result: string | undefined;
  isError: boolean;
}): ConnectorConnectRequest | null {
  const { qualifiedToolName, result, isError } = params;
  if (!isError) return null;
  if (typeof result !== 'string' || result.length === 0) return null;
  if (!result.includes(CONNECTOR_AUTHORIZATION_REQUIRED_KEY)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  if (parsed[CONNECTOR_AUTHORIZATION_REQUIRED_KEY] !== true) return null;

  const connectorId = parsed['connectorId'];
  const toolName = parsed['toolName'];
  const connectorName = parsed['connectorName'];
  const reason = parsed['reason'];
  const connectUrl = parsed['connectUrl'];

  if (typeof connectorId !== 'string' || !CONNECTOR_ID_RE.test(connectorId)) return null;
  if (typeof toolName !== 'string' || toolName.length === 0) return null;
  if (typeof connectorName !== 'string' || connectorName.length === 0) return null;
  if (connectorName.length > MAX_CONNECTOR_NAME_LENGTH) return null;
  if (typeof reason !== 'string') return null;
  if (!REASONS.includes(reason as ConnectorAuthorizationReason)) return null;

  if (`mcp__${connectorId}__${toolName}` !== qualifiedToolName) return null;

  const scopes = readScopes(parsed['scopes']);
  if (scopes === null) return null;

  let verifiedConnectUrl: string | null;
  if (connectUrl === null || connectUrl === undefined) {
    verifiedConnectUrl = null;
  } else if (typeof connectUrl === 'string' && isTrustedConnectUrl(connectUrl, connectorId)) {
    verifiedConnectUrl = connectUrl;
  } else {
    return null;
  }

  return {
    connectorId,
    connectorName,
    toolName,
    qualifiedToolName,
    reason: reason as ConnectorAuthorizationReason,
    connectUrl: verifiedConnectUrl,
    scopes,
  };
}

export function buildConnectHref(connectUrl: string, returnPath: string | null): string {
  if (!returnPath) return connectUrl;
  if (returnPath.length > MAX_RETURN_PATH_LENGTH) return connectUrl;
  if (!isRelativeSameOriginPath(returnPath)) return connectUrl;
  const separator = connectUrl.includes('?') ? '&' : '?';
  return `${connectUrl}${separator}returnPath=${encodeURIComponent(returnPath)}`;
}
