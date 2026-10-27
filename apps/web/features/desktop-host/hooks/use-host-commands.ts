'use client';

import { useEffect } from 'react';
import type { HostBridge, HostCommand } from '@agiworkforce/local-runtime-contract';
import { useUIStore } from '@shared/stores/layout-store';
import { emitAppCommand, type AppCommand } from '@shared/lib/app-commands';

/**
 * The app command each menu item becomes. The surface that owns the behaviour
 * answers it: the chat page, the app shell or the conversation's find bar.
 */
const APP_COMMAND_FOR_HOST_COMMAND: Record<Exclude<HostCommand, 'toggle-sidebar'>, AppCommand> = {
  'show-keyboard-shortcuts': 'open-shortcuts',
  find: 'open-find',
  search: 'open-search',
  'previous-chat': 'go-to-previous-chat',
  'next-chat': 'go-to-next-chat',
  'new-temporary-chat': 'new-temporary-chat',
};

/**
 * Carries out the menu items the shell cannot do itself.
 *
 * The sidebar and the overlays belong to the page, so the native menu sends a
 * command and this is what honours it, through what the page already owns: the
 * layout store and the app commands its surfaces listen for, rather than a
 * second way to do the same thing. A shell newer than this page can send a
 * command it does not know; that one is ignored, not mistaken for another.
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
      if (!Object.prototype.hasOwnProperty.call(APP_COMMAND_FOR_HOST_COMMAND, command)) return;
      emitAppCommand(APP_COMMAND_FOR_HOST_COMMAND[command]);
    });
  }, [host]);
}
