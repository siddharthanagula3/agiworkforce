'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * The WAI-ARIA dialog keyboard contract for any hand-rolled `role="dialog"`
 * panel: Escape closes it, Tab stays inside it, focus enters it on open and
 * returns to whatever opened it on close.
 *
 * `AccessibleDialog` is the richer answer when a panel can adopt its title,
 * description and footer slots. This is for the panels that own their own
 * layout and need only the behaviour.
 *
 * Listens in the CAPTURE phase for the same reason `useMenuKeyboard` does:
 * surrounding surfaces run their own Escape and arrow handlers on document
 * listeners and would otherwise consume the event first. A React handler on
 * the panel loses that race in a real browser while still passing in jsdom,
 * which has no competing listener.
 */
export function useDialogKeyboard({
  open,
  onClose,
  panelRef,
  closeOnEscape = true,
  autoFocus = true,
}: {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  /** Off for a dialog whose own content must answer Escape, such as a nested editor. */
  closeOnEscape?: boolean;
  /** Off when the panel focuses a specific field itself. */
  autoFocus?: boolean;
}): void {
  const openerRef = useRef<HTMLElement | null>(null);

  const focusable = useCallback((): HTMLElement[] => {
    const panel = panelRef.current;
    if (!panel) return [];
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => element.getAttribute('aria-hidden') !== 'true',
    );
  }, [panelRef]);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !autoFocus) return;
    const id = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      if (panel.contains(document.activeElement)) return;
      const first = focusable()[0];
      if (first) {
        first.focus();
        return;
      }
      if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
      panel.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, autoFocus, focusable, panelRef]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      const active = document.activeElement as HTMLElement | null;
      if (active !== null && !panel.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, closeOnEscape, onClose, focusable, panelRef]);
}
