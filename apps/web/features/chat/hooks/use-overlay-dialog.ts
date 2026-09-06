import { useEffect, useRef, useState, type RefObject } from 'react';

const MOBILE_OVERLAY_QUERY = '(max-width: 639px)';

export type OverlayLayout = 'unknown' | 'mobile' | 'desktop';

/**
 * A side panel that sits beside the conversation on a wide screen and covers it
 * on a narrow one. Only the covering form is a dialog, so only that form gets
 * dialog semantics.
 */
export function useOverlayLayout(): OverlayLayout {
  const [layout, setLayout] = useState<OverlayLayout>('unknown');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setLayout('desktop');
      return;
    }
    const query = window.matchMedia(MOBILE_OVERLAY_QUERY);
    const apply = (): void => setLayout(query.matches ? 'mobile' : 'desktop');
    apply();
    if (typeof query.addEventListener !== 'function') return;
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return layout;
}

export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null || element === document.activeElement);
}

/**
 * Contain focus inside a panel that is covering the page, close it on Escape,
 * and hand focus back to whatever opened it.
 *
 * Without this a full-screen panel leaves focus wherever it was, which means a
 * keyboard or screen-reader user can be typing into the composer underneath an
 * opaque overlay - the sources sheet did exactly that.
 */
export function useOverlayDialog(
  panelRef: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
): void {
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    if (!panel) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initial = focusableWithin(panel)[0] ?? panel;
    initial.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDismiss();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableWithin(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', onKeyDown);
    return () => {
      panel.removeEventListener('keydown', onKeyDown);
      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (restore && document.contains(restore)) restore.focus();
    };
  }, [active, onDismiss, panelRef]);
}
