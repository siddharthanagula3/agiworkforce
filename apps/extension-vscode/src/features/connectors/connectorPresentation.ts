import type {
  ConnectorConnection,
  ConnectorHealthState,
  ConnectorSource,
} from '@agiworkforce/cloud-contracts';
import { accountRefusalMessage } from '../../utils/accountRefusal';

const CONNECTOR_FAILURE_REASON_MAX_LENGTH = 240;

const HEALTH_FACES: Record<ConnectorHealthState, { label: string; icon: string }> = {
  connected: { label: 'Connected', icon: 'plug' },
  connectable: { label: 'Not connected', icon: 'circle-outline' },
  'needs-reauthorization': { label: 'Needs reauthorization', icon: 'warning' },
  'not-responding': { label: 'Not responding', icon: 'cloud-offline' },
  'not-configured': { label: 'Not configured here', icon: 'circle-slash' },
  'unsupported-here': { label: 'Not available on the web app', icon: 'circle-slash' },
};

const SOURCE_LABELS: Record<ConnectorSource, string> = {
  user: 'Connected on your account',
  'github-app': 'GitHub App installation',
  custom: 'Custom MCP server',
  oauth: 'Authorized with OAuth',
};

export function connectorTitle(connector: ConnectorConnection): string {
  return connector.name?.trim() || connector.connectorId;
}

export function connectorHealth(connector: ConnectorConnection): ConnectorHealthState {
  if (connector.health !== undefined) return connector.health;
  return connector.needsReauthorization === true ? 'needs-reauthorization' : 'connected';
}

export function connectorIcon(connector: ConnectorConnection): string {
  return HEALTH_FACES[connectorHealth(connector)].icon;
}

export function formatTimestamp(iso: string): string {
  if (iso.trim() === '') return '';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleString();
}

export function connectorDescription(connector: ConnectorConnection): string {
  const parts = [HEALTH_FACES[connectorHealth(connector)].label, SOURCE_LABELS[connector.source]];
  const connectedAt = formatTimestamp(connector.connectedAt);
  if (connectedAt !== '') parts.push(`since ${connectedAt}`);
  return parts.join(' · ');
}

const READ_SCOPE = /(?:^|[._:/-])(?:read|readonly|view|list|get|search)(?:$|[._:/-])/iu;
const WRITE_SCOPE =
  /(?:^|[._:/-])(?:write|send|compose|modify|create|delete|manage|edit|admin|full|insert|update)(?:$|[._:/-])/iu;

export function describeConnectorScopes(scopes: readonly string[]): string[] {
  const writes = scopes.filter((scope) => WRITE_SCOPE.test(scope));
  const reads = scopes.filter((scope) => !WRITE_SCOPE.test(scope) && READ_SCOPE.test(scope));
  const other = scopes.filter((scope) => !writes.includes(scope) && !reads.includes(scope));
  const lines: string[] = [];
  if (writes.length > 0) lines.push(`Can make changes: ${writes.join(', ')}`);
  if (reads.length > 0) lines.push(`Can read only: ${reads.join(', ')}`);
  if (other.length > 0) lines.push(`Other access: ${other.join(', ')}`);
  return lines;
}

export function connectorTooltipLines(connector: ConnectorConnection): string[] {
  const lines = [connectorTitle(connector), connectorDescription(connector)];
  lines.push(`Authenticates with ${connector.authType}`);
  if (connector.scopes !== undefined && connector.scopes.length > 0) {
    lines.push(...describeConnectorScopes(connector.scopes));
  }
  lines.push('Connecting and disconnecting happen in the browser, not in VS Code.');
  return lines;
}

export function connectorContextValue(connector: ConnectorConnection): string {
  return connectorHealth(connector) === 'needs-reauthorization'
    ? 'connectorNeedsReauthorization'
    : 'connector';
}

export function pendingConnectorDescription(): string {
  return 'Authorization was started and never finished';
}

export function describeConnectorFailure(error: unknown): string {
  const refusal = accountRefusalMessage(error);
  if (refusal) return refusal;
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 401) return 'your AGI Cloud session expired, sign in again';
  if (status === 403) return 'this account cannot manage connectors on its current plan';
  if (status === 429) return 'AGI Cloud is rate limiting this account, try again shortly';
  const raw = error instanceof Error ? error.message.trim() : String(error).trim();
  if (raw === '') return 'AGI Cloud gave no reason';
  return raw.length <= CONNECTOR_FAILURE_REASON_MAX_LENGTH
    ? raw
    : `${raw.slice(0, CONNECTOR_FAILURE_REASON_MAX_LENGTH - 1)}…`;
}
