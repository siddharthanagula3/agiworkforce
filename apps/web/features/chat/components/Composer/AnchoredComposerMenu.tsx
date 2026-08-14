'use client';

/**
 * AnchoredComposerMenu — a composer popover that cannot be clipped away.
 *
 * WHY THIS EXISTS
 *
 * Every composer menu was an `absolute bottom-full` div rendered inside the
 * composer. The composer sits at the bottom of a column of `overflow-hidden`
 * flex containers (the chat shell clips its own scroll regions), so a popover
 * taller than the space above the composer is not scrolled or flipped — it is
 * silently CUT OFF, and the clipped rows stop receiving pointer events.
 *
 * That was not theoretical. At a 670px-tall viewport the "+" menu is 392px and
 * opened with its top 34px outside the clip rect, which removed the FIRST row —
 * "Add photos & files" — from the product. `document.elementFromPoint` over
 * that row returned the shell div, not the button. There was no way to attach a
 * file to a message from the web composer at all: the hidden `<input
 * type="file">` was still in the DOM, still wired, and unreachable.
 *
 * `position: fixed` alone does not fix it either — the composer sets
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

/** Gap between the trigger and the menu edge. */
const ANCHOR_OFFSET_PX = 8;
/** Minimum breathing room between the menu and the viewport edge. */
const VIEWPORT_PADDING_PX = 8;
/** Below this much free space above the trigger, prefer flipping downward. */
const MIN_USABLE_SPACE_PX = 160;

export interface AnchoredComposerMenuProps {
  /** The element the menu is positioned against — usually the trigger button. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Render nothing when false. */
  open: boolean;
  /**
   * Which trigger edge the menu's horizontal edge lines up with.
   * `start` = left edges align, `end` = right edges align.
   */
  align?: 'start' | 'end';
  /**
   * Receives the positioned content element. Callers use it so their
   * outside-click handler can treat the portaled menu as "inside".
   */
  contentRef?: React.RefObject<HTMLDivElement | null>;
  /** Applied to the positioned element — pass the width and padding here. */
  className?: string;
  children: React.ReactNode;
}

interface Position {
  left: number;
  /** Set for the above-placement; the menu grows upward from this bottom edge. */
  bottom?: number;
  /** Set for the flipped (below) placement. */
  top?: number;
  maxHeight: number;
}

export function AnchoredComposerMenu({
  anchorRef,
  open,
  align = 'start',
  contentRef,
  className,
  children,
}: AnchoredComposerMenuProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  // Portals need a DOM target, which does not exist during SSR or the first
  // client render. Gate on mount so the markup matches on hydration.
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

    // Measure the natural height with any previous clamp lifted, otherwise the
    // menu would ratchet smaller every time it is repositioned.
    const naturalHeight = content.scrollHeight;

    // Above is the composer's idiom, so keep it unless it genuinely cannot
    // work: the menu does not fit above AND below is roomier.
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

  // Position before paint so the menu never renders at the wrong spot first.
  useLayoutEffect(() => {
    if (!open || !mounted) {
      setPosition(null);
      return;
    }
    reposition();
  }, [open, mounted, reposition]);

  // Keep it anchored while the page moves under it. `scroll` is captured so
  // inner scrollers count, not just the window.
  useEffect(() => {
    if (!open || !mounted) return undefined;
    const onChange = () => reposition();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);

    // Menu content is dynamic (submenus expand in place), so react to its own
    // size changes rather than only to the window's.
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onChange) : undefined;
    if (observer && internalRef.current) observer.observe(internalRef.current);

    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
      observer?.disconnect();
    };
  }, [open, mounted, reposition]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      ref={setContentNode}
      style={{
        position: 'fixed',
        left: position?.left ?? 0,
        ...(position?.bottom !== undefined ? { bottom: position.bottom } : {}),
        ...(position?.top !== undefined ? { top: position.top } : {}),
        maxHeight: position?.maxHeight,
        // Until the first measurement lands the menu would flash at (0,0);
        // it is laid out but not painted for that one frame.
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
