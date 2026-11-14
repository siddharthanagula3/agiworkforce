import type { ConnectorPersonalSource } from '@agiworkforce/cloud-contracts';

import type { ConnectedConnector, ConnectorListing } from '@/services/connectors';
import {
  connectionStatus,
  type ConnectionStatus,
} from '@/src/features/settings/cloud-connectors/connectorStatus';

export type PersonalSourceOptionState = ConnectionStatus | 'not-connected';

export type PersonalSourceOption =
  | {
      kind: 'connector';
      key: string;
      name: string;
      routeId: string;
      state: PersonalSourceOptionState;
    }
  | { kind: 'device'; key: 'device-calendar'; name: string; state: 'connected' | 'not-connected' };

export interface PersonalSourceRowModel {
  source: ConnectorPersonalSource;
  title: string;
  connected: boolean;
  options: PersonalSourceOption[];
}

export const PERSONAL_SOURCE_TITLES: Record<ConnectorPersonalSource, string> = {
  email: 'Email',
  calendar: 'Calendar',
};

export const DEVICE_CALENDAR_NAME = 'Calendar on this phone';

const CONNECTABLE_NOW: ReadonlySet<ConnectorListing['connectable']> = new Set([
  'connect',
  'api-key-form',
]);

function connectionFor(
  listing: ConnectorListing,
  connections: readonly ConnectedConnector[],
): ConnectedConnector | null {
  return (
    connections.find(
      (connection) =>
        connection.connectorId === listing.id || connection.directoryId === listing.id,
    ) ?? null
  );
}

export function buildPersonalSourceRow(input: {
  source: ConnectorPersonalSource;
  listings: readonly ConnectorListing[];
  connections: readonly ConnectedConnector[];
  deviceCalendarGranted: boolean;
}): PersonalSourceRowModel | null {
  const { source, listings, connections, deviceCalendarGranted } = input;
  const kindListings = listings.filter((listing) => listing.personalSources?.includes(source));
  if (kindListings.length === 0) return null;

  const options: PersonalSourceOption[] = [];
  for (const listing of kindListings) {
    const connection = connectionFor(listing, connections);
    if (!connection && !CONNECTABLE_NOW.has(listing.connectable)) continue;
    options.push({
      kind: 'connector',
      key: `connector:${listing.id}`,
      name: listing.name,
      routeId: connection?.connectorId ?? listing.id,
      state: connection ? connectionStatus(connection) : 'not-connected',
    });
  }
  if (source === 'calendar') {
    options.push({
      kind: 'device',
      key: 'device-calendar',
      name: DEVICE_CALENDAR_NAME,
      state: deviceCalendarGranted ? 'connected' : 'not-connected',
    });
  }
  if (options.length === 0) return null;
  return {
    source,
    title: PERSONAL_SOURCE_TITLES[source],
    connected: options.some((option) => option.state === 'connected'),
    options,
  };
}

export function personalSourceOptionLabel(state: PersonalSourceOptionState): string {
  switch (state) {
    case 'connected':
      return 'Connected';
    case 'needs-reauthorization':
      return 'Authorization expired, reconnect';
    case 'not-responding':
      return 'Not responding';
    default:
      return 'Not connected';
  }
}
