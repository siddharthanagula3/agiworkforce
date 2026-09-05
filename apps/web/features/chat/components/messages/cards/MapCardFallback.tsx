'use client';

import { Spinner } from '@agiworkforce/ui';

export const MAP_CARD_LOADING_LABEL = 'Loading the map';

export function MapCardFallback() {
  return (
    <div className="my-3 grid min-h-24 place-items-center rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)]">
      <Spinner size="sm" className="text-[color:var(--chat-text-secondary)]" />
      <span className="sr-only">{MAP_CARD_LOADING_LABEL}</span>
    </div>
  );
}
