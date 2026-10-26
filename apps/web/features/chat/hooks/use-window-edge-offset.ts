'use client';

import { useLayoutEffect, type RefObject } from 'react';

export const WINDOW_EDGE_OFFSET_PROPERTY = '--window-edge-offset';

/**
 * The desktop shell floats its window buttons, and the page's history controls,
 * over the top-left of the window. A header that does not start at the window's
 * left edge, because a sidebar rail sits beside it, only needs to step aside by
 * what is left of that inset, so it publishes where it starts.
 */
export function useWindowEdgeOffset(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !document.documentElement.hasAttribute('data-desktop-host')) return undefined;
    const publish = () => {
      element.style.setProperty(
        WINDOW_EDGE_OFFSET_PROPERTY,
        `${Math.round(element.getBoundingClientRect().left)}px`,
      );
    };
    publish();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
}
