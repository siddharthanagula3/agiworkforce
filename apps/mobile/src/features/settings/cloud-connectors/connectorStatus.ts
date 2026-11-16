import { catalogConnectorName } from '@agiworkforce/cloud-contracts';

import type { ConnectedConnector } from '@/services/connectors';

export type ConnectionStatus = 'connected' | 'needs-reauthorization' | 'not-responding';

export function connectionStatus(connection: ConnectedConnector): ConnectionStatus {
  if (connection.needsReauthorization === true || connection.health === 'needs-reauthorization') {
    return 'needs-reauthorization';
  }
  return connection.health === 'not-responding' ? 'not-responding' : 'connected';
}

export function formatConnectorName(connectorId: string): string {
  const catalogName = catalogConnectorName(connectorId);
  if (catalogName) return catalogName;
  return connectorId
    .replace(/^custom-/, '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
