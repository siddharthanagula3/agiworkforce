'use client';

import { useEffect, useState } from 'react';
import {
  NO_HOST_NAVIGATION,
  type HostBridge,
  type HostNavigationDirection,
  type HostNavigationState,
} from '@agiworkforce/local-runtime-contract';

export interface HostNavigationControls extends HostNavigationState {
  go: (direction: HostNavigationDirection) => void;
}

/**
 * The window's history state, or null where the shell offers none.
 *
 * A browser has its own back and forward and an older shell predates the
 * bridge member, so null is what tells the page not to draw its own. The state
 * comes from the shell's session history rather than the page's `history`
 * object, which cannot see the pages loaded before the app took over.
 */
export function useHostNavigation(host: HostBridge | null): HostNavigationControls | null {
  const navigation = host?.navigation;
  const [state, setState] = useState<HostNavigationState>(NO_HOST_NAVIGATION);

  useEffect(() => {
    if (!navigation) return undefined;

    let live = true;
    const unsubscribe = navigation.onChange((next) => {
      if (live) setState(next);
    });
    void navigation
      .read()
      .then((next) => {
        if (live) setState(next);
      })
      .catch(() => undefined);

    return () => {
      live = false;
      unsubscribe();
    };
  }, [navigation]);

  if (!navigation) return null;
  return {
    ...state,
    go: (direction) => {
      void navigation.go(direction).catch(() => undefined);
    },
  };
}
