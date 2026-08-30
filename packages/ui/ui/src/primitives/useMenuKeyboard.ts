'use client';

import { useCallback, useEffect, type RefObject } from 'react';

const NAV_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

/**
 * The WAI-ARIA menu keyboard contract for any hand-rolled `role="menu"` panel.
 *
 * Listens in the CAPTURE phase on purpose: surrounding surfaces (the sidebar's
 * conversation list, for one) run their own arrow-key navigation on document
 * listeners and would otherwise consume the event first, walking focus out of
 * the open menu. A React handler on the panel loses that race in a real
 * browser while still passing in jsdom, which has no competing listener.
 */
export function useMenuKeyboard({
  open,
  onClose,
  panelRef,
  triggerRef,
  itemSelector = '[role="menuitem"]',
}: {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  triggerRef?: RefObject<HTMLElement | null>;
  itemSelector?: string;
}): void {
  const items = useCallback((): HTMLElement[] => {
    const panel = panelRef.current;
    if (!panel) return [];
    return Array.from(panel.querySelectorAll<HTMLElement>(itemSelector)).filter(
      (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true',
    );
  }, [panelRef, itemSelector]);

  const focusItem = useCallback(
    (index: number) => {
      const list = items();
      if (list.length === 0) return;
      const next = ((index % list.length) + list.length) % list.length;
      list[next]?.focus();
    },
    [items],
  );

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => focusItem(0), 0);
    return () => window.clearTimeout(id);
  }, [open, focusItem]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        triggerRef?.current?.focus();
        return;
      }
      if (event.key === 'Tab') {
        onClose();
        return;
      }
      if (!NAV_KEYS.includes(event.key)) return;
      const list = items();
      if (list.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const current = list.indexOf(document.activeElement as HTMLElement);
      if (event.key === 'ArrowDown') focusItem(current + 1);
      else if (event.key === 'ArrowUp') focusItem(current - 1);
      else if (event.key === 'Home') focusItem(0);
      else focusItem(list.length - 1);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose, focusItem, items, triggerRef]);
}
