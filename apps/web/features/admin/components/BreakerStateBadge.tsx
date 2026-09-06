'use client';

import type { RouteBreakerState } from '@agiworkforce/routing';

const STATE_LABEL: Record<RouteBreakerState, string> = {
  closed: 'Closed',
  degraded: 'Degraded',
  open: 'Open',
  half_open: 'Half open',
};

const STATE_CLASS: Record<RouteBreakerState, string> = {
  closed: 'border-border bg-muted text-foreground',
  degraded: 'border-warning bg-muted text-warning-text',
  open: 'border-destructive bg-muted text-destructive-text',
  half_open: 'border-info bg-muted text-info-text',
};

export default function BreakerStateBadge({ state }: { state: RouteBreakerState }) {
  return (
    <span
      data-breaker-state={state}
      className={`whitespace-nowrap rounded-md border px-2 py-1 text-xs ${STATE_CLASS[state]}`}
    >
      {STATE_LABEL[state]}
    </span>
  );
}
