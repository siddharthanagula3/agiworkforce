'use client';

/**
 * Reads the OS reduced-motion preference.
 *
 * Uses matchMedia directly rather than framer-motion's `useReducedMotion`
 * because test/setup.ts stubs that hook to a constant `false`, which would make
 * any reduced-motion test vacuous.
 */

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(QUERY);
    setReduced(media.matches);

    const onChange = (event: MediaQueryListEvent) => {
      setReduced(event.matches);
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => {
        media.removeEventListener('change', onChange);
      };
    }
    // Safari < 14 / older jsdom.
    if (typeof media.addListener === 'function') {
      media.addListener(onChange);
      return () => {
        media.removeListener(onChange);
      };
    }
    return undefined;
  }, []);

  return reduced;
}
