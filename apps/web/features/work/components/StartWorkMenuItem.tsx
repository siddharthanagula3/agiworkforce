'use client';

import { Sparkles } from 'lucide-react';
import {
  WORK_ENTRY_POINT_LABELS,
  useStartWork,
  type WorkLaunchRequest,
  type WorkLaunchSource,
} from '../launch';

export interface StartWorkMenuItemProps {
  source: WorkLaunchSource;
  conversationId?: string | null;
  objective?: string | null;
  className?: string;
  onLaunched?: (request: WorkLaunchRequest) => void;
}

/**
 * The one control every surface uses to hand something to Work, so a file, an
 * artifact, a connector result, a browsed page and a desktop window all start
 * the same run rather than five look-alike flows.
 */
export function StartWorkMenuItem({
  source,
  conversationId = null,
  objective = null,
  className,
  onLaunched,
}: StartWorkMenuItemProps) {
  const startWork = useStartWork();
  const label = WORK_ENTRY_POINT_LABELS[source.entryPoint];

  return (
    <button
      type="button"
      role="menuitem"
      className={
        className ??
        'flex min-h-8 w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      }
      style={{ color: 'var(--text-1)' }}
      onClick={() => {
        const request: WorkLaunchRequest = { source, objective, conversationId };
        startWork(request);
        onLaunched?.(request);
      }}
    >
      <Sparkles size={13} aria-hidden="true" />
      {label}
    </button>
  );
}
