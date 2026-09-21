'use client';

import { useEffect } from 'react';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';
import { useChatUIStore } from '@agiworkforce/unified-chat';
import { useUIStore } from '@shared/stores/layout-store';
import { readShellLayout, writeShellLayout } from '../lib/runtime-client';

/**
 * Inside the shell the layout has one home, the shell's window state, rather
 * than a copy in this window's storage that the next window never sees. One
 * read on mount, one write per change; outside the shell nothing runs.
 */
export function useShellLayout(host: HostBridge | null): void {
  useEffect(() => {
    if (!host) return undefined;

    let live = true;
    let adopting = true;

    void readShellLayout()
      .then((layout) => {
        if (!live) return;
        if (layout.sidebarCollapsed !== null) {
          useUIStore.getState().setSidebarCollapsed(layout.sidebarCollapsed);
        }
        if (layout.secondaryPanelWidth !== null) {
          useChatUIStore.getState().setArtifactPanelWidth(layout.secondaryPanelWidth);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        adopting = false;
      });

    const push = (patch: { sidebarCollapsed?: boolean; secondaryPanelWidth?: number }) => {
      if (!live || adopting) return;
      void writeShellLayout(patch).catch(() => undefined);
    };

    const unsubscribeSidebar = useUIStore.subscribe((state, previous) => {
      if (state.sidebarCollapsed !== previous.sidebarCollapsed) {
        push({ sidebarCollapsed: state.sidebarCollapsed });
      }
    });

    const unsubscribePanel = useChatUIStore.subscribe((state, previous) => {
      if (state.artifactPanelWidth !== previous.artifactPanelWidth) {
        push({ secondaryPanelWidth: state.artifactPanelWidth });
      }
    });

    return () => {
      live = false;
      unsubscribeSidebar();
      unsubscribePanel();
    };
  }, [host]);
}
