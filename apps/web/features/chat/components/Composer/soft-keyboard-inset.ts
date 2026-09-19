'use client';

import { useEffect, useState } from 'react';

// Under this a shrinking visual viewport is collapsing browser chrome, not a
// keyboard, and lifting the composer for it would make the page jump on scroll.
const SOFT_KEYBOARD_MIN_INSET = 80;

export interface VisualViewportReading {
  height: number;
  offsetTop: number;
}

export function softKeyboardInset(
  viewport: VisualViewportReading | null,
  layoutHeight: number,
): number {
  if (!viewport || layoutHeight <= 0) return 0;
  const inset = Math.round(layoutHeight - viewport.height - viewport.offsetTop);
  return inset >= SOFT_KEYBOARD_MIN_INSET ? inset : 0;
}

/**
 * How much of the layout viewport the soft keyboard covers. A browser that
 * honours interactive-widget=resizes-content shrinks the layout viewport with
 * the keyboard and reports 0 here; iOS Safari never does, and reports the real
 * inset the composer has to be lifted by.
 */
export function useSoftKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setInset(softKeyboardInset(viewport, window.innerHeight));
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
