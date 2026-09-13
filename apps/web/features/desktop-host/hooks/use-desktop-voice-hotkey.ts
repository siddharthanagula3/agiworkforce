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
