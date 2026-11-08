'use client';

import { useEffect, useRef } from 'react';
import { getHostBridge } from '@agiworkforce/local-runtime-contract';
import { onAppCommand } from '@shared/lib/app-commands';

/**
 * Keeps View > Show Terminal in step with a terminal pane this page owns.
 * The item stays disabled until a pane is mounted, and the menu command
 * uses the same toggle the pane's own button uses.
 */
export function useShowTerminal(available: boolean, open: boolean, toggle: () => void): void {
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  useEffect(() => {
    const host = getHostBridge();
    if (!available) {
      host?.setTerminalState?.({ available: false, open: false });
      return undefined;
    }
    host?.setTerminalState?.({ available: true, open });
    return () => {
      host?.setTerminalState?.({ available: false, open: false });
    };
  }, [available, open]);

  useEffect(() => {
    if (!available) return undefined;
    return onAppCommand('toggle-terminal', () => toggleRef.current());
  }, [available]);
}
