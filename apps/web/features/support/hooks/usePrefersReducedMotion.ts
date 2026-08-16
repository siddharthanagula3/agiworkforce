'use client';

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
