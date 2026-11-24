'use client';

import { useEffect, useRef } from 'react';
import { getHostBridge } from '@agiworkforce/local-runtime-contract';
import { onAppCommand } from '@shared/lib/app-commands';
import { safePlatform } from '@shared/utils/browser-utils';
import { isLocalTerminalShortcut } from './local-code';

/**
 * A parent rendering a terminal-owning child must leave the child's native menu state alone.
 */
export function useShowTerminal(
  available: boolean,
  open: boolean,
  toggle: () => void,
  ownsTerminal = true,
): void {
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  useEffect(() => {
    if (!ownsTerminal) return undefined;
    const host = getHostBridge();
    if (!available) {
      host?.setTerminalState?.({ available: false, open: false });
      return undefined;
    }
    host?.setTerminalState?.({ available: true, open });
    return () => {
      host?.setTerminalState?.({ available: false, open: false });
    };
  }, [available, open, ownsTerminal]);

  useEffect(() => {
    if (!ownsTerminal || !available) return undefined;
    const unsubscribe = onAppCommand('toggle-terminal', () => toggleRef.current());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isLocalTerminalShortcut(event, safePlatform.isMac())) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) toggleRef.current();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      unsubscribe();
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [available, ownsTerminal]);
}
