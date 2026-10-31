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
  'h-9 gap-1.5 px-2.5 text-sm text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] pointer-coarse:min-h-11 pointer-coarse:min-w-11';
export const RICH_BLOCK_ICON_ACTION_CLASS =
  'h-9 w-9 p-0 text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] pointer-coarse:min-h-11 pointer-coarse:min-w-11';

interface RichBlockCardProps {
  kind: string;
  label: string;
  actions?: React.ReactNode;
  status?: React.ReactNode;
  children: React.ReactNode;
}

export function RichBlockCard({ kind, label, actions, status, children }: RichBlockCardProps) {
  return (
    <section
      aria-label={label}
      data-rich-block={kind}
      className={cn(
        'my-4 min-w-0 overflow-clip border-[var(--chat-border-subtle)] bg-[var(--chat-bg)]',
        kind === 'email' ? 'rounded-[var(--chat-radius-lg)] border' : 'border-y',
      )}
    >
      <div
        data-rich-block-header=""
        className={cn(
          'sticky top-0 z-[var(--z-content-raised)]',
          'flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1',
          'bg-[var(--chat-bg)] py-1 ps-5 pe-2',
        )}
      >
        <span className="min-w-0 wrap-anywhere text-xs text-[var(--chat-text-secondary)]">
          {label}
        </span>
        <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-0.5">
          {actions}
        </div>
      </div>
      {status}
      {children}
    </section>
  );
}
