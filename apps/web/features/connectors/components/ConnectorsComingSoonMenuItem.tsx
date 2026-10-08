'use client';

import { Lock } from '@agiworkforce/icons';
import { CONNECTORS_COMING_SOON_LABEL, CONNECTORS_COMING_SOON_MESSAGE } from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';

export const CONNECTORS_COMING_SOON_MENU_ITEM_TESTID = 'connectors-coming-soon-menu-item';

export function ConnectorsComingSoonMenuItem({
  label,
  compact = false,
  className,
}: {
  label: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      role="menuitem"
      aria-disabled="true"
      tabIndex={-1}
      aria-label={`${label}, ${CONNECTORS_COMING_SOON_LABEL}`}
      title={CONNECTORS_COMING_SOON_MESSAGE}
      data-testid={CONNECTORS_COMING_SOON_MENU_ITEM_TESTID}
      className={cn(
        'flex w-full cursor-not-allowed items-center gap-3 rounded-lg text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        compact ? 'px-3 py-2' : 'min-h-10 px-2 py-1.5',
        className,
      )}
    >
      {compact ? (
        <Lock aria-hidden className="h-4 w-4 shrink-0" />
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border">
          <Lock aria-hidden className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-start">{label}</span>
      <span className="shrink-0 text-xs">{CONNECTORS_COMING_SOON_LABEL}</span>
    </div>
  );
}
