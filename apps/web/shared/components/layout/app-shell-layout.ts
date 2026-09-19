'use client';

import { useEffect, useState } from 'react';

export const SHELL_TABLET_MIN_WIDTH = 768;
export const SHELL_REGULAR_MIN_WIDTH = 1024;

export type ShellLayoutTier = 'compact' | 'tablet' | 'regular';
export type ShellOrientation = 'portrait' | 'landscape';
/** drawer: header trigger only. rail: icons stay, expanding opens the drawer. */
export type ShellSidebarMode = 'drawer' | 'rail' | 'persistent';

export interface ShellViewport {
  width: number;
  height: number;
}

export interface ShellLayout {
  tier: ShellLayoutTier;
  orientation: ShellOrientation;
  sidebarMode: ShellSidebarMode;
}

export function resolveShellLayout({ width, height }: ShellViewport): ShellLayout {
  const orientation: ShellOrientation = width >= height ? 'landscape' : 'portrait';
  if (width < SHELL_TABLET_MIN_WIDTH) {
    return { tier: 'compact', orientation, sidebarMode: 'drawer' };
  }
  if (width >= SHELL_REGULAR_MIN_WIDTH) {
    return { tier: 'regular', orientation, sidebarMode: 'persistent' };
  }
  // A tablet in portrait, and an iPad split view at the same width, cannot give
  // 260px to navigation and still hold a readable column, so the sidebar keeps
  // its icons there and expands over the content instead of beside it.
  return {
    tier: 'tablet',
    orientation,
    sidebarMode: orientation === 'landscape' ? 'persistent' : 'rail',
  };
}

// Matches the pre-mount assumption the shell has always made: a desktop window
// until the browser says otherwise, so a wide first paint never flashes a
// mobile header.
const SERVER_LAYOUT = resolveShellLayout({
  width: SHELL_REGULAR_MIN_WIDTH,
  height: SHELL_TABLET_MIN_WIDTH,
});

export function useShellLayout(): ShellLayout {
  const [layout, setLayout] = useState<ShellLayout>(SERVER_LAYOUT);

  useEffect(() => {
    const update = () => {
      const next = resolveShellLayout({ width: window.innerWidth, height: window.innerHeight });
      setLayout((current) =>
        current.tier === next.tier &&
        current.orientation === next.orientation &&
        current.sidebarMode === next.sidebarMode
          ? current
          : next,
      );
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return layout;
}
