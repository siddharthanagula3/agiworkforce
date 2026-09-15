'use client';

import { useEffect } from 'react';
import type { HostBridge } from '@agiworkforce/local-runtime-contract';

const ZOOM_PROPERTY = '--agi-window-zoom';

/**
 * Publishes the window's zoom factor to the stylesheet.
 *
 * The strip the shell reserves is measured in CSS pixels, and the window
 * buttons the platform floats over it are not: zooming out shrinks the strip
 * out from under them and the brand mark slides back under the close button,
 * which is the defect that made the first attempt at a hidden title bar
 * unshippable. Dividing the reserved sizes by this keeps the reserved band the
 * same number of real pixels at every zoom level.
 *
 * `outerWidth` is screen pixels and `innerWidth` is CSS pixels, so their ratio
 * is the zoom factor, and a zoom change resizes the layout viewport, which is
 * what the resize listener is for.
 */
export function useWindowZoom(host: HostBridge | null): void {
  useEffect(() => {
    if (!host || typeof window === 'undefined') return undefined;

    const root = document.documentElement;
    const apply = () => {
      const zoom = window.innerWidth > 0 ? window.outerWidth / window.innerWidth : 1;
      root.style.setProperty(ZOOM_PROPERTY, String(Number.isFinite(zoom) && zoom > 0 ? zoom : 1));
    };

    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      root.style.removeProperty(ZOOM_PROPERTY);
    };
  }, [host]);
}
