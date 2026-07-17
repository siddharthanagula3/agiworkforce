'use client';

/**
 * Drift resolution: this is a merge, not a pick, of two independent and
 * opposite-direction changes found between web and desktop:
 *
 * 1. Desktop's stale-closure fix (kept): desktop stores `onResize`/`minWidth`/
 *    `maxWidth`/`isResizing` in refs updated via a `useEffect` and reads them from
 *    inside the mousemove/mouseup handlers, instead of closing over the render-time
 *    values captured in `handleMouseDown`'s `useCallback` deps. Web's version closes
 *    directly over those props, so an in-flight drag keeps using stale prop values if
 *    they change mid-drag (classic stale-closure bug). Desktop's ref-based version is
 *    a genuine, deliberate bug fix and is kept here.
 *
 * 2. Web's focus-visible ring (restored): desktop's div had dropped the
 *    `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
 *    focus-visible:ring-offset-1` classes that web has, even though the div keeps
 *    `tabIndex={0}` and full keyboard-arrow-key resize handling — losing the ring
 *    left the keyboard-operable handle with no visible focus indicator on desktop, a
 *    real (if small) accessibility regression that looked unrelated to the
 *    stale-closure fix. Restored here.
 *
 * No test coverage existed for either version's specific behavior on desktop —
 * apps/web/components/ui/ResizeHandle.test.tsx covers ARIA/drag/keyboard behavior but
 * was never ported. Porting that test is left for a later phase.
 */

import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../cn';

interface ResizeHandleProps {
  onResize: (newWidth: number) => void;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  direction?: 'left' | 'right';
  className?: string;
  isResizing?: (resizing: boolean) => void;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  onResize,
  width,
  minWidth = 200,
  maxWidth = 800,
  direction = 'right',
  className,
  isResizing,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const handlersRef = useRef<{ move?: (e: MouseEvent) => void; up?: () => void }>({});

  // Store latest callback refs to prevent stale closures during active drag
  const onResizeRef = useRef(onResize);
  const minWidthRef = useRef(minWidth);
  const maxWidthRef = useRef(maxWidth);
  const isResizingRef = useRef(isResizing);

  useEffect(() => {
    onResizeRef.current = onResize;
    minWidthRef.current = minWidth;
    maxWidthRef.current = maxWidth;
    isResizingRef.current = isResizing;
  });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      isResizingRef.current?.(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const startX = e.clientX;
      const startWidth = width;

      const handleMouseUp = () => {
        setIsDragging(false);
        isResizingRef.current?.(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (handlersRef.current.move)
          document.removeEventListener('mousemove', handlersRef.current.move);
        if (handlersRef.current.up) document.removeEventListener('mouseup', handlersRef.current.up);
        handlersRef.current = {};
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const change = direction === 'right' ? deltaX : -deltaX;
        const newWidth = Math.max(
          minWidthRef.current,
          Math.min(maxWidthRef.current, startWidth + change),
        );
        onResizeRef.current(newWidth);
      };

      handlersRef.current = { move: handleMouseMove, up: handleMouseUp };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [width, direction],
  );

  // Cleanup effect to ensure event listeners are removed on unmount
  useEffect(() => {
    return () => {
      if (handlersRef.current.move) {
        document.removeEventListener('mousemove', handlersRef.current.move);
      }
      if (handlersRef.current.up) {
        document.removeEventListener('mouseup', handlersRef.current.up);
      }
    };
  }, []);

  return (
    <div
      className={cn(
        'absolute top-0 bottom-0 z-50 w-1 hover:bg-primary/50 cursor-col-resize transition-colors select-none touch-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        isDragging && 'bg-primary',
        direction === 'right' ? '-right-0.5' : '-left-0.5',
        className,
      )}
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const change = direction === 'right' ? -10 : 10;
          onResize(Math.max(minWidth, Math.min(maxWidth, width + change)));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          const change = direction === 'right' ? 10 : -10;
          onResize(Math.max(minWidth, Math.min(maxWidth, width + change)));
        }
      }}
    />
  );
};
