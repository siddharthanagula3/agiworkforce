'use client';

import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import { OfficialConnectorLogo } from '@/features/connectors/components/OfficialConnectorLogo';
import { useConnectors } from '@/features/connectors/hooks/use-connectors';
import { Prose } from '@/features/marketing/components/system';

const CONNECTORS_BY_ID = new Map(CONNECTORS.map((connector) => [connector.id, connector]));

export function ConnectorChecklist({ connectorIds }: { connectorIds: string[] }) {
  const { connectedIds, loading: connectorsLoading } = useConnectors();

  if (connectorIds.length === 0) {
    return <Prose>This plugin does not require any connectors.</Prose>;
  }

  return (
    <ul className="agi-ds-ledger" aria-label="Required connectors">
      {connectorIds.map((connectorId) => {
        const connected = !connectorsLoading && connectedIds.has(connectorId);
        const connector = CONNECTORS_BY_ID.get(connectorId);
        return (
          <li key={connectorId} className="agi-ds-ledger-row">
            <span
              className="agi-ds-ledger-label"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              {connected ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              {connector ? (
                <OfficialConnectorLogo connector={connector} className="h-6 w-6 rounded-md" />
              ) : null}
              <span>{connector?.name ?? connectorId}</span>
            </span>
            <span className="agi-ds-ledger-value">
              {connectorsLoading ? (
                'Checking…'
              ) : connected ? (
                'Connected'
              ) : (
                <Link href="/connectors" className="agi-ds-link">
                  Connect
                </Link>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
