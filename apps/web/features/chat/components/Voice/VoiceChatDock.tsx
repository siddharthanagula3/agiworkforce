'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import {
  Check,
  LibraryBig,
  MessageSquareText,
  Paperclip,
  Plug,
  Square,
  SquarePen,
} from '@agiworkforce/icons';
import { useMenuKeyboard } from '@agiworkforce/ui';

import { AnchoredComposerMenu } from '../Composer/AnchoredComposerMenu';

const LABEL = {
  panel: 'In this chat',
  newChat: 'New chat',
  addFiles: 'Add photos & files',
  library: 'Open from Library',
  connectors: 'Connectors',
  call: 'This call',
  captions: 'Captions',
  pause: 'Pause call',
} as const;

const ITEM_CLASS =
  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)] focus:bg-[var(--chat-surface-hover)] focus:outline-none';

const PANEL_CLASS =
  'w-[290px] rounded-2xl border-[var(--chat-border-strong)] bg-[var(--chat-surface-overlay)] p-2 shadow-[var(--chat-shadow-lg)] backdrop-blur-none';

export interface VoiceChatDockProps {
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onNewChat: () => void;
  onAddFiles: () => void;
  onOpenLibrary: () => void;
  onOpenConnectors: () => void;
  captionsOpen: boolean;
  onToggleCaptions: () => void;
  /** Absent once the call has ended or is already paused, when there is nothing to pause. */
  onPause?: (() => void) | undefined;
}

export function VoiceChatDock({
  open,
  triggerRef,
  onClose,
  onNewChat,
  onAddFiles,
  onOpenLibrary,
  onOpenConnectors,
  captionsOpen,
  onToggleCaptions,
  onPause,
}: VoiceChatDockProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useMenuKeyboard({ open, onClose, panelRef, triggerRef });

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
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

  return (
    <AnchoredComposerMenu
      anchorRef={triggerRef}
      open={open}
      label={LABEL.panel}
      autoFocusFirstItem={false}
      className={PANEL_CLASS}
    >
      <div ref={panelRef} role="menu" aria-label={LABEL.panel} data-testid="voice-chat-dock">
        <p className="px-3 pb-1 pt-2 text-xs font-medium text-[var(--chat-text-muted)]">
          {LABEL.panel}
        </p>
        <button type="button" role="menuitem" onClick={run(onNewChat)} className={ITEM_CLASS}>
          <SquarePen className="h-4 w-4 shrink-0" aria-hidden="true" />
          {LABEL.newChat}
        </button>
        <button type="button" role="menuitem" onClick={run(onAddFiles)} className={ITEM_CLASS}>
          <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />
          {LABEL.addFiles}
        </button>
        <button type="button" role="menuitem" onClick={run(onOpenLibrary)} className={ITEM_CLASS}>
          <LibraryBig className="h-4 w-4 shrink-0" aria-hidden="true" />
          {LABEL.library}
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={run(onOpenConnectors)}
          className={ITEM_CLASS}
        >
          <Plug className="h-4 w-4 shrink-0" aria-hidden="true" />
          {LABEL.connectors}
        </button>
        <p className="px-3 pb-1 pt-3 text-xs font-medium text-[var(--chat-text-muted)]">
          {LABEL.call}
        </p>
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={captionsOpen}
          onClick={run(onToggleCaptions)}
          data-testid="voice-captions-toggle"
          className={ITEM_CLASS}
        >
          <MessageSquareText className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{LABEL.captions}</span>
          {captionsOpen ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
        </button>
        {onPause ? (
          <button
            type="button"
            role="menuitem"
            onClick={run(onPause)}
            data-testid="voice-pause-toggle"
            className={ITEM_CLASS}
          >
            <Square className="h-4 w-4 shrink-0" aria-hidden="true" />
            {LABEL.pause}
          </button>
        ) : null}
      </div>
    </AnchoredComposerMenu>
  );
}
