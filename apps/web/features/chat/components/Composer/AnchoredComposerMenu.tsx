'use client';

/**
 * AnchoredComposerMenu: a composer popover that cannot be clipped away.
 *
 * WHY THIS EXISTS
 *
 * Every composer menu was an `absolute bottom-full` div rendered inside the
 * composer. The composer sits at the bottom of a column of `overflow-hidden`
 * flex containers (the chat shell clips its own scroll regions), so a popover
 * taller than the space above the composer is not scrolled or flipped, it is
 * silently CUT OFF, and the clipped rows stop receiving pointer events.
 *
 * That was not theoretical. At a 670px-tall viewport the "+" menu is 392px and
 * opened with its top 34px outside the clip rect, which removed the FIRST row.
 * "Add photos & files", from the product. `document.elementFromPoint` over
 * that row returned the shell div, not the button. There was no way to attach a
 * file to a message from the web composer at all: the hidden `<input
 * type="file">` was still in the DOM, still wired, and unreachable.
 *
 * `position: fixed` alone does not fix it either, the composer sets
 * `backdrop-blur` below `md`, and a backdrop-filter ancestor becomes the
 * containing block for fixed descendants, so the clip returns on the exact
 * narrow viewports where space is tightest.
 *
 * So: render through a portal on `document.body`, position from the trigger's
 * own rect, flip below when there is more room there, and clamp the height to
 * the viewport with internal scrolling. A menu can then be arbitrarily tall and
 * every row stays reachable.
 *
 * The caller keeps ownership of open/close state and of its own outside-click
 * handling; because the content is portaled OUT of the trigger's subtree, a
 * caller whose "click outside" test is `triggerWrapper.contains(target)` must
 * also consult {@link AnchoredComposerMenuProps.contentRef}, or every click
 * inside the menu reads as an outside click.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@shared/lib/utils';

const ANCHOR_OFFSET_PX = 8;
const VIEWPORT_PADDING_PX = 8;
const MIN_USABLE_SPACE_PX = 160;
const FOCUSABLE_ITEM_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const NAV_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

function isRendered(el: HTMLElement): boolean {
  return typeof el.checkVisibility === 'function' ? el.checkVisibility() : true;
}

function focusableItems(node: HTMLElement | null): HTMLElement[] {
  if (!node) return [];
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_ITEM_SELECTOR)).filter(isRendered);
}

export interface AnchoredComposerMenuProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  align?: 'start' | 'end';
  contentRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
  /** Announced name for the popup. Without it the panel is an unlabelled region. */
  label: string;
  /**
   * Moves focus to the first focusable row on open, and lets Arrow/Home/End
   * move real focus between rows. Right for a menu opened by a click; wrong
   * for one opened by typing (mentions, slash commands), where taking focus
   * off the input sends the rest of the user's keystrokes nowhere, that
   * caller keeps focus in its own field and moves a virtual highlight from
   * the same keydown it already reads.
   */
  autoFocusFirstItem?: boolean;
  /** Escape and Tab-out close the popup through this. */
  onRequestClose?: () => void;
  children: React.ReactNode;
}

interface Position {
  left: number;
  bottom?: number;
  top?: number;
  maxHeight: number;
}

export function AnchoredComposerMenu({
  anchorRef,
  open,
  align = 'start',
  contentRef,
  className,
  label,
  autoFocusFirstItem = true,
  onRequestClose,
  children,
}: AnchoredComposerMenuProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const setContentNode = useCallback(
    (node: HTMLDivElement | null) => {
      internalRef.current = node;
      if (contentRef) contentRef.current = node;
    },
    [contentRef],
  );

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const content = internalRef.current;
    if (!anchor || !content) return;

    const anchorRect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const spaceAbove = anchorRect.top - ANCHOR_OFFSET_PX - VIEWPORT_PADDING_PX;
    const spaceBelow = viewportHeight - anchorRect.bottom - ANCHOR_OFFSET_PX - VIEWPORT_PADDING_PX;

    const naturalHeight = content.scrollHeight;

    const placeAbove =
      naturalHeight <= spaceAbove || spaceAbove >= spaceBelow || spaceAbove >= MIN_USABLE_SPACE_PX;

    const width = content.offsetWidth;
    let left = align === 'end' ? anchorRect.right - width : anchorRect.left;
    left = Math.min(
      Math.max(left, VIEWPORT_PADDING_PX),
      Math.max(VIEWPORT_PADDING_PX, viewportWidth - width - VIEWPORT_PADDING_PX),
    );

    setPosition(
      placeAbove
        ? {
            left,
            bottom: viewportHeight - anchorRect.top + ANCHOR_OFFSET_PX,
            maxHeight: Math.max(MIN_USABLE_SPACE_PX, spaceAbove),
          }
        : {
            left,
            top: anchorRect.bottom + ANCHOR_OFFSET_PX,
            maxHeight: Math.max(MIN_USABLE_SPACE_PX, spaceBelow),
          },
    );
  }, [align, anchorRef]);

  useLayoutEffect(() => {
    if (!open || !mounted) {
      setPosition(null);
      return;
    }
    reposition();
  }, [open, mounted, reposition]);

  useEffect(() => {
    if (!open || !mounted) return undefined;
    const onChange = () => reposition();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onChange) : undefined;
    if (observer && internalRef.current) observer.observe(internalRef.current);

    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
      observer?.disconnect();
    };
  }, [open, mounted, reposition]);

  // The panel opened with no focus inside it and no Escape handling, so a
  // keyboard user could open it and neither reach its contents nor dismiss it.
  // Synchronous (not a setTimeout(0) passive effect): a key pressed right
  // after open, before the deferred timer ever ran, used to find no item
  // holding focus and misfire the wrap-around math against index -1.
  useLayoutEffect(() => {
    if (!open || !mounted || !autoFocusFirstItem) return;
    const node = contentRef?.current ?? internalRef.current;
    focusableItems(node)[0]?.focus();
  }, [open, mounted, contentRef, autoFocusFirstItem]);

  // Capture phase: a surrounding list (the sidebar) runs its own arrow-key
  // navigation on a bubble-phase listener and must lose this race. A plain
  // useEffect is a passive effect deferred until after paint, on a separate
  // task from the click that opened the menu - a key pressed in that gap (a
  // fast real user, or any programmatic open+key pair with no gap between
  // them) reaches the browser before this listener attaches, so it falls
  // through uncaught to whatever ambient handler is already listening.
  // useLayoutEffect runs synchronously in the same commit as the `open`
  // state change, before the browser can process a subsequent input event.
  useLayoutEffect(() => {
    if (!open || !mounted) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!onRequestClose) return;
        event.stopPropagation();
        onRequestClose();
        anchorRef.current?.focus();
        return;
      }
      if (!autoFocusFirstItem || !NAV_KEYS.includes(event.key)) return;
      const node = contentRef?.current ?? internalRef.current;
      const items = focusableItems(node);
      if (items.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next =
        event.key === 'ArrowDown'
          ? (current + 1 + items.length) % items.length
          : event.key === 'ArrowUp'
            ? (current - 1 + items.length) % items.length
            : event.key === 'Home'
              ? 0
              : items.length - 1;
      items[next]?.focus();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, mounted, onRequestClose, anchorRef, contentRef, autoFocusFirstItem]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      ref={setContentNode}
      role="dialog"
      aria-modal="false"
      aria-label={label}
      style={{
        position: 'fixed',
        left: position?.left ?? 0,
        ...(position?.bottom !== undefined ? { bottom: position.bottom } : {}),
        ...(position?.top !== undefined ? { top: position.top } : {}),
        maxHeight: position?.maxHeight,
        visibility: position ? 'visible' : 'hidden',
      }}
      className={cn(
        'z-[var(--z-popover,350)] overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-popover/95 shadow-xl backdrop-blur-xl',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
