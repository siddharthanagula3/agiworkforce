'use client';

import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import { OfficialConnectorLogo } from '@/features/connectors/components/OfficialConnectorLogo';
import { useConnectors } from '@/features/connectors/hooks/use-connectors';

const CONNECTORS_BY_ID = new Map(CONNECTORS.map((connector) => [connector.id, connector]));

export function ConnectorChecklist({ connectorIds }: { connectorIds: string[] }) {
  const { connectedIds, loading: connectorsLoading } = useConnectors();

  if (connectorIds.length === 0) {
    return (
      <p className="agi-reason-p" style={{ margin: 0 }}>
        This plugin does not require any connectors.
      </p>
    );
  }

  return (
    <ul className="agi-plugin-connectors">
      {connectorIds.map((connectorId) => {
        const connected = !connectorsLoading && connectedIds.has(connectorId);
        const connector = CONNECTORS_BY_ID.get(connectorId);
        return (
          <li key={connectorId} className="agi-plugin-connector">
            <span className="agi-plugin-connector-id">
              {connected ? (
                <CheckCircle2
                  className="h-4 w-4 shrink-0"
                  style={{ color: 'var(--agi-amber)' }}
                  aria-hidden="true"
                />
              ) : (
                <Circle
                  className="h-4 w-4 shrink-0"
                  style={{ color: 'var(--agi-ink-faint)' }}
                  aria-hidden="true"
                />
              )}
              {connector ? (
                <OfficialConnectorLogo connector={connector} className="h-6 w-6 rounded-md" />
              ) : null}
              <span>{connector?.name ?? connectorId}</span>
            </span>
            <span>
              {connectorsLoading ? (
                <span className="agi-plugin-connector-note">Checking…</span>
              ) : connected ? (
                <span className="agi-plugin-connector-note" style={{ color: 'var(--agi-amber)' }}>
                  Connected
                </span>
              ) : (
                <Link href="/connectors" className="agi-cta-ghost" style={{ padding: 0 }}>
                  Connect →
                </Link>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
