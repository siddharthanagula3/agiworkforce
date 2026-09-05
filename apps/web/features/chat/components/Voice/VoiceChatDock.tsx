'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { LibraryBig, Plug, SquarePen } from '@agiworkforce/icons';
import { useMenuKeyboard } from '@agiworkforce/ui';

const LABEL = {
  panel: 'In this chat',
  newChat: 'New chat',
  library: 'Open from Library',
  connectors: 'Connectors',
} as const;

const ITEM_CLASS =
  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)] focus:bg-[var(--chat-surface-hover)] focus:outline-none';

export interface VoiceChatDockProps {
  open: boolean;
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onNewChat: () => void;
  onOpenLibrary: () => void;
  onOpenConnectors: () => void;
}

export function VoiceChatDock({
  open,
  triggerRef,
  onClose,
  onNewChat,
  onOpenLibrary,
  onOpenConnectors,
}: VoiceChatDockProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useMenuKeyboard({ open, onClose, panelRef, ...(triggerRef ? { triggerRef } : {}) });

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, onClose, triggerRef]);

  const run = useCallback(
    (action: () => void) => () => {
      action();
      onClose();
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={LABEL.panel}
      data-testid="voice-chat-dock"
      className="fixed right-4 top-16 z-[var(--z-popover,200)] w-[290px] rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-overlay)] p-2 shadow-[var(--chat-shadow-lg)]"
    >
      <p className="px-3 pb-1 pt-2 text-xs font-medium text-[var(--chat-text-muted)]">
        {LABEL.panel}
      </p>
      <button type="button" role="menuitem" onClick={run(onNewChat)} className={ITEM_CLASS}>
        <SquarePen className="h-4 w-4 shrink-0" aria-hidden="true" />
        {LABEL.newChat}
      </button>
      <button type="button" role="menuitem" onClick={run(onOpenLibrary)} className={ITEM_CLASS}>
        <LibraryBig className="h-4 w-4 shrink-0" aria-hidden="true" />
        {LABEL.library}
      </button>
      <button type="button" role="menuitem" onClick={run(onOpenConnectors)} className={ITEM_CLASS}>
        <Plug className="h-4 w-4 shrink-0" aria-hidden="true" />
        {LABEL.connectors}
      </button>
    </div>
  );
}
