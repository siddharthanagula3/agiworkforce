'use client';

import { useEffect } from 'react';
import type { HostBridge, HostCommand } from '@agiworkforce/local-runtime-contract';
import { useUIStore } from '@shared/stores/layout-store';
import { emitAppCommand } from '@shared/lib/app-commands';
import { openGrantedFolder } from '../lib/open-granted-folder';
import { toggleChangesPanel } from '../lib/changes-panel';
import { toggleChatTabsVisible } from '../lib/chat-tab-strip';
import { toggleDesktopPerformanceTrace } from '../lib/performance-trace';

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
      if (
        command === 'find' ||
        command === 'find-next' ||
        command === 'find-previous' ||
        command === 'find-in-files'
      ) {
        emitAppCommand(command);
        return;
      }
      if (command === 'open-search') {
        emitAppCommand('open-search');
        return;
      }
      if (command === 'open-folder') {
        void openGrantedFolder();
        return;
      }
      if (command === 'new-project') {
        emitAppCommand('new-project');
        return;
      }
      if (command === 'previous-chat' || command === 'next-chat') {
        emitAppCommand(command);
        return;
      }
      if (command === 'previous-tab' || command === 'next-tab' || command === 'new-tab') {
        emitAppCommand(command);
        return;
      }
      if (command === 'new-temporary-chat') {
        emitAppCommand(command);
        return;
      }
      if (command === 'send-feedback') {
        emitAppCommand('open-feedback');
        return;
      }
      if (command === 'toggle-terminal') {
        emitAppCommand('toggle-terminal');
        return;
      }
      if (command === 'toggle-side-chat') {
        emitAppCommand('toggle-side-chat');
        return;
      }
      if (command === 'start-performance-trace') {
        toggleDesktopPerformanceTrace();
        return;
      }
      if (command === 'toggle-chat-tabs') {
        toggleChatTabsVisible();
        return;
      }
      if (command === 'reopen-closed-tab') {
        emitAppCommand('reopen-closed-tab');
        return;
      }
      if (command === 'focus-first-tab') {
        emitAppCommand('focus-first-tab');
        return;
      }
      if (command === 'close-active-tab') {
        emitAppCommand('close-active-tab');
        return;
      }
      if (command === 'close-other-tabs') {
        emitAppCommand('close-other-tabs');
        return;
      }
      if (command === 'close-tabs-to-the-right') {
        emitAppCommand('close-tabs-to-the-right');
        return;
      }
      if (command === 'focus-second-tab') {
        emitAppCommand('focus-second-tab');
        return;
      }
      if (command === 'focus-third-tab') {
        emitAppCommand('focus-third-tab');
        return;
      }
      if (command === 'focus-fourth-tab') {
        emitAppCommand('focus-fourth-tab');
        return;
      }
      if (command === 'focus-fifth-tab') {
        emitAppCommand('focus-fifth-tab');
        return;
      }
      if (command === 'focus-sixth-tab') {
        emitAppCommand('focus-sixth-tab');
        return;
      }
      if (command === 'focus-seventh-tab') {
        emitAppCommand('focus-seventh-tab');
        return;
      }
      if (command === 'focus-eighth-tab') {
        emitAppCommand('focus-eighth-tab');
        return;
      }
      if (command === 'toggle-changes') {
        toggleChangesPanel();
        return;
      }
      if (command === 'toggle-files') {
        emitAppCommand('toggle-files');
        return;
      }
      if (command === 'focus-follow-up') {
        emitAppCommand('focus-follow-up');
        return;
      }
      if (command === 'show-keyboard-shortcuts') emitAppCommand('open-shortcuts');
    });
  }, [host]);
}
