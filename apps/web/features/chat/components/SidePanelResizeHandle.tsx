'use client';

import { useCallback, type KeyboardEvent, type PointerEvent } from 'react';
import {
  MAX_SIDE_PANEL_WIDTH,
  MIN_SIDE_PANEL_WIDTH,
  useChatUIStore,
} from '@agiworkforce/unified-chat';

const SIDE_PANEL_WIDTH_KEY_STEP = 24;

export function useSidePanelWidth(): number {
  return useChatUIStore((s) => s.artifactPanelWidth);
}

export function SidePanelResizeHandle({ label }: { label: string }) {
  const width = useSidePanelWidth();
  const setWidth = useChatUIStore((s) => s.setArtifactPanelWidth);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const onPointerMove = (move: globalThis.PointerEvent) => {
        setWidth(window.innerWidth - move.clientX);
      };
      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        document.body.style.removeProperty('user-select');
      };
      document.body.style.setProperty('user-select', 'none');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [setWidth],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        setWidth(event.key === 'Home' ? MIN_SIDE_PANEL_WIDTH : MAX_SIDE_PANEL_WIDTH);
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setWidth(
        width +
          (event.key === 'ArrowLeft' ? SIDE_PANEL_WIDTH_KEY_STEP : -SIDE_PANEL_WIDTH_KEY_STEP),
      );
    },
    [setWidth, width],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={MIN_SIDE_PANEL_WIDTH}
      aria-valuemax={MAX_SIDE_PANEL_WIDTH}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className="absolute inset-y-0 -left-1 z-[var(--z-control)] w-2 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-primary/30 focus-visible:bg-primary/40 focus-visible:outline-none motion-reduce:transition-none"
    />
  );
}
