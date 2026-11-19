'use client';

import { ShieldAlert } from 'lucide-react';
import { CONNECTOR_CONSENT_HEADING, CONNECTOR_CONSENT_POINTS } from '@agiworkforce/cloud-contracts';

export function ConnectorConsentSummary({ className }: { className?: string }) {
  return (
    <div
      className={
        className ?? 'rounded-xl border border-warning-fill/20 bg-warning-fill/5 p-3.5 text-start'
      }
    >
      <div className="mb-2 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-warning-text" aria-hidden="true" />
        <span className="text-xs font-semibold text-warning-text">{CONNECTOR_CONSENT_HEADING}</span>
      </div>
      <ul className="space-y-1.5">
        {CONNECTOR_CONSENT_POINTS.map((point) => (
          <li key={point.title} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning-fill/50" />
            <span>
              <span className="font-medium text-foreground">{point.title}.</span> {point.body}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-caption text-muted-foreground">
        Full detail:{' '}
        <a href="/agent-permissions" className="underline hover:text-foreground">
          agent permissions
        </a>{' '}
        &middot;{' '}
        <a href="/acceptable-use" className="underline hover:text-foreground">
          acceptable use
        </a>
      </p>
    </div>
  );
}
