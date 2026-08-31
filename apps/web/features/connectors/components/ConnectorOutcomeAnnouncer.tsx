'use client';

import { useBrokerOutcome, invalidateConnectorsCache } from '../hooks/use-connectors';

export function ConnectorOutcomeAnnouncer(): null {
  useBrokerOutcome(invalidateConnectorsCache);
  return null;
}
