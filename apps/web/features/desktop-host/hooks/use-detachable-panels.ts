'use client';

import { useCallback, useLayoutEffect, useMemo } from 'react';
import { useDesktopHost } from '../lib/host';
import {
  closePanelWindow,
  detachPanel,
  focusPanelWindow,
  usePanelWindow,
  type DetachablePanel,
  type PanelWindowControls,
} from '../lib/panel-windows';

interface DetachablePanelSlots {
  enabled: boolean;
  workOpen: boolean;
  setWorkOpen: (open: boolean) => void;
  researchOpen: boolean;
  setResearchOpen: (open: boolean) => void;
}

export interface DetachablePanels {
  available: boolean;
  isDetached: (panel: DetachablePanel) => boolean;
  inlineControls: (panel: DetachablePanel) => PanelWindowControls;
  detachedControls: (panel: DetachablePanel) => PanelWindowControls;
  focus: (panel: DetachablePanel) => void;
  close: (panel: DetachablePanel) => void;
}

export function useDetachablePanels({
  enabled,
  workOpen,
  setWorkOpen,
  researchOpen,
  setResearchOpen,
}: DetachablePanelSlots): DetachablePanels {
  const host = useDesktopHost();
  const workWindow = usePanelWindow('work');
  const researchWindow = usePanelWindow('research');

  useLayoutEffect(() => {
    if (workWindow && workOpen) setWorkOpen(false);
  }, [setWorkOpen, workOpen, workWindow]);

  useLayoutEffect(() => {
    if (!researchWindow || !researchOpen) return;
    setResearchOpen(false);
    focusPanelWindow('research');
  }, [researchOpen, researchWindow, setResearchOpen]);

  const setOpen = useCallback(
    (panel: DetachablePanel, open: boolean) =>
      panel === 'work' ? setWorkOpen(open) : setResearchOpen(open),
    [setResearchOpen, setWorkOpen],
  );

  const available = enabled && host !== null;
  return useMemo<DetachablePanels>(
    () => ({
      available,
      isDetached: (panel) => (panel === 'work' ? workWindow : researchWindow) !== null,
      inlineControls: (panel) => ({
        detached: false,
        onToggle: () => {
          if (detachPanel(panel)) setOpen(panel, false);
        },
      }),
      detachedControls: (panel) => ({
        detached: true,
        onToggle: () => {
          closePanelWindow(panel);
          setOpen(panel, true);
        },
      }),
      focus: focusPanelWindow,
      close: closePanelWindow,
    }),
    [available, researchWindow, setOpen, workWindow],
  );
}
