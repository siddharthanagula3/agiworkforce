import { useEffect, useState } from 'react';
import { create } from 'zustand';

export type NotificationTargetKind = 'trigger' | 'schedule' | 'background-agent';

export interface NotificationTarget {
  kind: NotificationTargetKind;
  id: string;
}

interface NotificationTargetState {
  pending: NotificationTarget | null;
  request: (target: NotificationTarget) => void;
  settle: (target: NotificationTarget) => void;
}

export const useNotificationTargetStore = create<NotificationTargetState>((set) => ({
  pending: null,
  request: (target) => set({ pending: target }),
  settle: (target) => set((state) => (state.pending === target ? { pending: null } : state)),
}));

export const NOTIFICATION_TARGET_ATTRIBUTE = 'data-notification-target';
const REVEAL_HIGHLIGHT_MS = 2500;

export function notificationTargetValue(kind: NotificationTargetKind, id: string): string {
  return `${kind}:${id}`;
}

function findTargetRow(kind: NotificationTargetKind, id: string): HTMLElement | null {
  const value = notificationTargetValue(kind, id);
  for (const row of document.querySelectorAll<HTMLElement>(`[${NOTIFICATION_TARGET_ATTRIBUTE}]`)) {
    if (row.getAttribute(NOTIFICATION_TARGET_ATTRIBUTE) === value) return row;
  }
  return null;
}

/**
 * Reveals the row a clicked notification named: scrolls it into view, moves
 * focus to it and returns its id for a short highlight. `ready` says the list
 * has loaded, so an id that is no longer in it is dropped instead of waiting.
 */
export function useNotificationTarget(
  kind: NotificationTargetKind,
  ids: readonly string[],
  ready: boolean,
): string | null {
  const pending = useNotificationTargetStore((state) => state.pending);
  const settle = useNotificationTargetStore((state) => state.settle);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const pendingId = pending?.kind === kind ? pending.id : null;
  const present = pendingId !== null && ids.includes(pendingId);

  useEffect(() => {
    if (!pending || pendingId === null) return;
    if (present) {
      settle(pending);
      setRevealedId(pendingId);
    } else if (ready) {
      settle(pending);
    }
  }, [pending, pendingId, present, ready, settle]);

  useEffect(() => {
    if (revealedId === null) return;
    const row = findTargetRow(kind, revealedId);
    row?.scrollIntoView?.({ block: 'center' });
    row?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => setRevealedId(null), REVEAL_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [kind, revealedId]);

  return revealedId;
}
