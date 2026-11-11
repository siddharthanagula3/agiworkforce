'use client';

import { useEffect, useRef } from 'react';
import { useDesktopHost } from '../lib/host';

/**
 * The shell's global dictation shortcut, routed into the composer's own
 * dictation controller. The shell focuses the composer before it fires, so the
 * transcript lands where the user is typing rather than in a second recorder
 * the desktop would have to own.
 */
export function useDesktopVoiceHotkey(onToggle: () => void): void {
  const host = useDesktopHost();
  const handler = useRef(onToggle);
  handler.current = onToggle;

  useEffect(() => {
    if (!host) return undefined;
    return host.onVoiceHotkey(() => handler.current());
  }, [host]);
}

/**
 * Runs when the shell hides this window. The global shortcut aims at whichever
 * window is showing, so a capture left running in a hidden window would never
 * receive its stop.
 */
export function useDesktopWindowHidden(onHidden: () => void, enabled: boolean): void {
  const host = useDesktopHost();
  const handler = useRef(onHidden);
  handler.current = onHidden;

  useEffect(() => {
    if (!host || !enabled) return undefined;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') handler.current();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [host, enabled]);
}
