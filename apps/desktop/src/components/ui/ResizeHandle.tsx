import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

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
