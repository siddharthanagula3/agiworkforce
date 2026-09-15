'use client';

import { useEffect } from 'react';
import type { HostBridge, HostCommand } from '@agiworkforce/local-runtime-contract';
import { useUIStore } from '@shared/stores/layout-store';
import { emitAppCommand } from '@shared/lib/app-commands';

/**
 * Carries out the menu items the shell cannot do itself.
 *
 * The sidebar and the shortcut sheet belong to the page, so the native menu
 * sends a command and this is what honours it. Both actions are routed through
 * what the page already owns, the layout store and the app command the
 * shortcut sheet already listens for, rather than a second way to do the same
 * thing.
 */
export function useHostCommands(host: HostBridge | null): void {
  useEffect(() => {
    if (!host) return undefined;

    return host.onHostCommand((command: HostCommand) => {
      if (command === 'toggle-sidebar') {
        const { sidebarCollapsed, setSidebarCollapsed } = useUIStore.getState();
        setSidebarCollapsed(!sidebarCollapsed);
        return;
      }
      emitAppCommand('open-shortcuts');
    });
  }, [host]);
}
