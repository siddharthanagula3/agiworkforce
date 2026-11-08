'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getHostBridge } from '@agiworkforce/local-runtime-contract';
import { onAppCommand } from '@shared/lib/app-commands';
import { chatIdFromPath } from '../lib/adjacent-chat';

const NEW_SIDE_CHAT_BUTTON =
  'rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent';

/**
 * The conversation beside the one this window is showing.
 *
 * The menu item stays disabled on a new chat, where there is no conversation
 * to sit beside. A draft typed here stays until New side chat starts a fresh one.
 * Close side chat drops that draft and closes the pane.
 */
export function SideChatPane() {
  const pathname = usePathname() ?? '';
  const available = chatIdFromPath(pathname) !== null;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const startFreshSideChat = () => {
    setDraft('');
    setOpen(true);
  };
  const closeSideChat = () => {
    setDraft('');
    setOpen(false);
  };

  useEffect(() => {
    const host = getHostBridge();
    if (!available) {
      host?.setSideChatState?.({ available: false, open: false });
      return undefined;
    }
    host?.setSideChatState?.({ available: true, open });
    return () => {
      host?.setSideChatState?.({ available: false, open: false });
    };
  }, [available, open]);

  useEffect(() => {
    if (!available) return undefined;
    return onAppCommand('toggle-side-chat', () => setOpen((current) => !current));
  }, [available]);

  if (!available) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={startFreshSideChat}
        className={`fixed bottom-4 end-4 z-[var(--z-popover)] ${NEW_SIDE_CHAT_BUTTON}`}
      >
        New side chat
      </button>
    );
  }

  return (
    <aside
      aria-label="Side chat"
      className="fixed bottom-4 end-4 z-[var(--z-popover)] flex w-[min(92vw,22rem)] flex-col gap-2 rounded-xl border border-border bg-background p-3 shadow-lg"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Side chat</h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={startFreshSideChat} className={NEW_SIDE_CHAT_BUTTON}>
            New side chat
          </button>
          <button type="button" onClick={closeSideChat} className={NEW_SIDE_CHAT_BUTTON}>
            Close side chat
          </button>
        </div>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Message
        <textarea
          value={draft}
          rows={3}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
    </aside>
  );
}
