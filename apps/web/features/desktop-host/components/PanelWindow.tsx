'use client';

import { useEffect, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AppWindow, PanelRightOpen } from 'lucide-react';
import { Button, PortalContainerProvider } from '@agiworkforce/ui';
import {
  retainPanelWindow,
  usePanelWindow,
  type DetachablePanel,
  type PanelWindowControls,
} from '../lib/panel-windows';

export function PanelWindowPortal({
  panel,
  children,
}: {
  panel: DetachablePanel;
  children: ReactNode;
}) {
  const container = usePanelWindow(panel);
  useEffect(() => retainPanelWindow(panel), [panel]);
  if (!container) return null;
  return createPortal(
    <PortalContainerProvider container={container}>{children}</PortalContainerProvider>,
    container,
  );
}

export function PanelWindowButton({
  controls,
  panelLabel,
  className,
}: {
  controls: PanelWindowControls;
  panelLabel: string;
  className?: string;
}) {
  const label = controls.detached
    ? `Move ${panelLabel} back to the main window`
    : `Open ${panelLabel} in a new window`;
  const Glyph = controls.detached ? PanelRightOpen : AppWindow;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={controls.onToggle}
      className={className}
      aria-label={label}
      title={label}
    >
      <Glyph className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}

export function useDetachedWindowTitle(
  ref: RefObject<HTMLElement | null>,
  title: string,
  detached: boolean,
): void {
  useEffect(() => {
    const owner = ref.current?.ownerDocument;
    if (detached && owner && owner !== document) owner.title = title;
  }, [detached, ref, title]);
}
