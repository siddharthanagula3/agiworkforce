'use client';

import Link from 'next/link';
import { CheckCircle2, Circle, Lock } from 'lucide-react';
import {
  CONNECTOR_RELEASE_STATE,
  CONNECTORS_COMING_SOON_LABEL,
  CONNECTORS_COMING_SOON_MESSAGE,
  connectorsReleased,
  type ConnectorReleaseState,
} from '@agiworkforce/types';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import { OfficialConnectorLogo } from '@/features/connectors/components/OfficialConnectorLogo';
import { useConnectors } from '@/features/connectors/hooks/use-connectors';
import { Prose } from '@/features/marketing/components/system';

const CONNECTORS_BY_ID = new Map(CONNECTORS.map((connector) => [connector.id, connector]));

const STATUS_UNREADABLE_COPY =
  'Your connections could not be read just now, so this list shows what the pack needs rather than what you have already connected.';

const LIST_LABEL = 'Required connectors';
const LABEL_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
} as const;
const ICON_CLASS = 'h-4 w-4 shrink-0';

function ConnectorIdentity({ connectorId }: { connectorId: string }) {
  const connector = CONNECTORS_BY_ID.get(connectorId);
  return (
    <>
      {connector ? (
        <OfficialConnectorLogo connector={connector} className="h-6 w-6 rounded-md" />
      ) : null}
      <span>{connector?.name ?? connectorId}</span>
    </>
  );
}

function LockedConnectorList({ connectorIds }: { connectorIds: string[] }) {
  return (
    <>
      <p className="agi-ds-prose" data-size="sm">
        {CONNECTORS_COMING_SOON_MESSAGE}
      </p>
      <ul className="agi-ds-ledger" aria-label={LIST_LABEL}>
        {connectorIds.map((connectorId) => (
          <li key={connectorId} className="agi-ds-ledger-row">
            <span className="agi-ds-ledger-label" style={LABEL_STYLE}>
              <Lock className={ICON_CLASS} aria-hidden="true" />
              <ConnectorIdentity connectorId={connectorId} />
            </span>
            <span className="agi-ds-ledger-value">{CONNECTORS_COMING_SOON_LABEL}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function LiveConnectorChecklist({ connectorIds }: { connectorIds: string[] }) {
  const { connectedIds, loading: connectorsLoading, error } = useConnectors();

  return (
    <>
      {error ? (
        <p className="agi-ds-prose" data-size="sm" role="status">
          {STATUS_UNREADABLE_COPY}
        </p>
      ) : null}
      <ul className="agi-ds-ledger" aria-label={LIST_LABEL}>
        {connectorIds.map((connectorId) => {
          const connected = !connectorsLoading && connectedIds.has(connectorId);
          return (
            <li key={connectorId} className="agi-ds-ledger-row">
              <span className="agi-ds-ledger-label" style={LABEL_STYLE}>
                {connected ? (
                  <CheckCircle2 className={ICON_CLASS} aria-hidden="true" />
                ) : (
                  <Circle className={ICON_CLASS} aria-hidden="true" />
                )}
                <ConnectorIdentity connectorId={connectorId} />
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
    </>
  );
}

export function ConnectorChecklist({
  connectorIds,
  releaseState = CONNECTOR_RELEASE_STATE,
}: {
  connectorIds: string[];
  releaseState?: ConnectorReleaseState;
}) {
  if (connectorIds.length === 0) {
    return <Prose>This plugin does not require any connectors.</Prose>;
  }
  return connectorsReleased(releaseState) ? (
    <LiveConnectorChecklist connectorIds={connectorIds} />
  ) : (
    <LockedConnectorList connectorIds={connectorIds} />
  );
}
