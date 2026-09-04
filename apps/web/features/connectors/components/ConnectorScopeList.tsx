'use client';

import { cn } from '@shared/lib/utils';
import { getConnectorScopeDescriptions } from '@/lib/connectors/scope-descriptions';

const ACCESS_BADGE_LABEL: Record<'read' | 'write', string> = { read: 'Read', write: 'Write' };

const ACCESS_BADGE_CLASS: Record<'read' | 'write', string> = {
  read: 'border-border text-muted-foreground',
  write: 'border-warning-fill/40 text-warning-text',
};

export function ConnectorScopeList({ connectorId }: { connectorId: string }) {
  const descriptions = getConnectorScopeDescriptions(connectorId);

  if (descriptions.status === 'none') return null;

  if (descriptions.status === 'pending') {
    return (
      <div
        className="rounded-lg border border-border/80 p-3 text-xs text-muted-foreground"
        aria-label="Permissions requested"
      >
        This provider&rsquo;s exact permissions have not been reviewed yet. Its own consent screen
        states what is granted.
      </div>
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
