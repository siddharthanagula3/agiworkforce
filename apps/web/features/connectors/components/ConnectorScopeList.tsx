'use client';

import { cn } from '@shared/lib/utils';
import { getConnectorCapability, type ConnectorRiskClass } from '@/lib/connectors/catalog';
import {
  describeGrantedConnectorScopes,
  getConnectorScopeDescriptions,
  summarizeConnectorScopes,
} from '@/lib/connectors/scope-descriptions';

const ACCESS_BADGE_LABEL: Record<'read' | 'write', string> = { read: 'Read', write: 'Write' };

const ACCESS_BADGE_CLASS: Record<'read' | 'write', string> = {
  read: 'border-border text-muted-foreground',
  write: 'border-warning-fill/40 text-warning-text',
};

const ACCESS_SENTENCE: Record<ConnectorRiskClass, string> = {
  'read-only':
    'This connector is set up to read data in the account you connect, not to change anything there.',
  'read-write':
    'This connector can read data in the account you connect and can also change it, for example by creating, editing or sending items.',
  'high-impact':
    'This connector can read and change sensitive data in the account you connect, such as payment, health or production records.',
};

const DISCOVERED_ACCESS_SENTENCE =
  'This server lists its own tools when you connect. Each tool it marks as read-only, and each that can change data, is shown in Tool permissions, where you can block the ones that change data.';

function AccessExplanation({ connectorId, pending }: { connectorId: string; pending: boolean }) {
  const riskClass = getConnectorCapability(connectorId)?.riskClass;
  return (
    <div
      className="space-y-1 rounded-lg border border-border/80 p-3 text-xs text-muted-foreground"
      aria-label="What this connector can do"
    >
      <p>{riskClass ? ACCESS_SENTENCE[riskClass] : DISCOVERED_ACCESS_SENTENCE}</p>
      {pending ? (
        <p>Its exact permissions are named on the provider&rsquo;s own consent screen.</p>
      ) : null}
    </div>
  );
}

export function ConnectorScopeList({ connectorId }: { connectorId: string }) {
  const descriptions = getConnectorScopeDescriptions(connectorId);
  const summary = summarizeConnectorScopes(connectorId);

  if (descriptions.status === 'none' || descriptions.status === 'pending') {
    return (
      <AccessExplanation connectorId={connectorId} pending={descriptions.status === 'pending'} />
    );
  }

  if (descriptions.entries.length === 0) {
    return (
      <div
        className="rounded-lg border border-border/80 p-3 text-xs text-muted-foreground"
        aria-label="Permissions requested"
      >
        This provider does not use OAuth scopes. Capabilities are set on its own side, not requested
        here.
      </div>
    );
  }

  return (
    <div
      className="space-y-1.5 rounded-lg border border-border/80 p-3"
      aria-label="Permissions requested"
    >
      <h4 className="text-xs font-semibold text-foreground">Permissions requested</h4>
      {summary ? <p className="text-xs text-muted-foreground">{summary.sentence}</p> : null}
      <ul className="space-y-1.5">
        {descriptions.entries.map((entry) => (
          <li key={entry.scope} className="flex items-start justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{entry.sentence}</span>
            <span
              className={cn(
                'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
                ACCESS_BADGE_CLASS[entry.access],
              )}
            >
              {ACCESS_BADGE_LABEL[entry.access]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ConnectorGrantedScopeList({ scopes }: { scopes: readonly string[] }) {
  if (scopes.length === 0) return null;
  return (
    <div
      className="space-y-1.5 rounded-lg border border-border/80 p-3"
      aria-label="Permissions granted"
    >
      <h4 className="text-xs font-semibold text-foreground">Permissions granted</h4>
      <ul className="space-y-1.5">
        {describeGrantedConnectorScopes(scopes).map((entry) => (
          <li key={entry.scope} className="flex items-start justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{entry.sentence}</span>
            <span
              className={cn(
                'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
                ACCESS_BADGE_CLASS[entry.access],
              )}
            >
              {ACCESS_BADGE_LABEL[entry.access]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
