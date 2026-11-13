import { type AgiThemeMode } from '@agiworkforce/design-tokens';
import { useEffect, useState } from 'react';

const DARK_CLASS = 'dark';
const LIGHT_CLASS = 'light';
const THEME_ATTR = 'data-theme';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function matchMediaSafe(query: string): MediaQueryList | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.matchMedia?.(query);
}

function readDocumentTheme(): AgiThemeMode {
  if (typeof document === 'undefined') return 'light';
  const root = document.documentElement;
  if (root.classList.contains(DARK_CLASS) || root.getAttribute(THEME_ATTR) === DARK_CLASS) {
    return 'dark';
  }
  if (root.classList.contains(LIGHT_CLASS) || root.getAttribute(THEME_ATTR) === LIGHT_CLASS) {
    return 'light';
  }
  return matchMediaSafe(DARK_MEDIA_QUERY)?.matches ? 'dark' : 'light';
}

export function useDocumentTheme(): AgiThemeMode {
  const [mode, setMode] = useState<AgiThemeMode>(readDocumentTheme);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => setMode(readDocumentTheme());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', THEME_ATTR],
    });
    const media = matchMediaSafe(DARK_MEDIA_QUERY);
    media?.addEventListener('change', sync);
    return () => {
      observer.disconnect();
      media?.removeEventListener('change', sync);
    };
  }, []);

  return mode;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => matchMediaSafe(REDUCED_MOTION_QUERY)?.matches ?? false,
  );

  useEffect(() => {
    const media = matchMediaSafe(REDUCED_MOTION_QUERY);
    if (!media) return;
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return reduced;
}
