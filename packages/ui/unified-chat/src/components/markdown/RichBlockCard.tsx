import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { reportClientFailure } from '../../lib/client-failures';

export type RichBlockCopyState = 'idle' | 'copied' | 'failed';

const COPIED_RESET_MS = 2000;
const COPY_FAILED_RESET_MS = 4000;

export function useRichBlockCopy(): {
  copyState: RichBlockCopyState;
  copy: (text: string) => Promise<boolean>;
} {
  const [copyState, setCopyState] = useState<RichBlockCopyState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = useCallback(async (text: string) => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      resetTimer.current = setTimeout(() => setCopyState('idle'), COPIED_RESET_MS);
      return true;
    } catch {
      reportClientFailure({ failure: 'code_copy', detail: 'permission_denied' });
      setCopyState('failed');
      resetTimer.current = setTimeout(() => setCopyState('idle'), COPY_FAILED_RESET_MS);
      return false;
    }
  }, []);

  return { copyState, copy };
}

export const RICH_BLOCK_ACTION_CLASS =
  'h-8 gap-1.5 px-2.5 text-xs text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] [@media(pointer:coarse)]:h-11';
export const RICH_BLOCK_ICON_ACTION_CLASS =
  'h-8 w-8 p-0 text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11';

interface RichBlockCardProps {
  kind: string;
  icon: React.ReactNode;
  label: string;
  actions?: React.ReactNode;
  status?: React.ReactNode;
  children: React.ReactNode;
}

export function RichBlockCard({
  kind,
  icon,
  label,
  actions,
  status,
  children,
}: RichBlockCardProps) {
  return (
    <section
      aria-label={label}
      data-rich-block={kind}
      className="my-4 overflow-clip rounded-[var(--chat-radius-lg)] border border-[var(--chat-border)] bg-[var(--chat-bg)]"
    >
      <div
        data-rich-block-header=""
        className={cn(
          'sticky top-0 z-[var(--z-content-raised)]',
          'flex min-h-11 items-center justify-between gap-2 border-b border-[var(--chat-border-subtle)]',
          'bg-[var(--chat-bg)] py-1 ps-4 pe-1.5',
        )}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--chat-text-secondary)]">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </span>
        <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
      </div>
      {status}
      {children}
    </section>
  );
}
