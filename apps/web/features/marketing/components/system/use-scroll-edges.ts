'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const EDGE_TOLERANCE_PX = 1;

export interface ScrollEdgeMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export interface ScrollEdges {
  scrollable: boolean;
  atStart: boolean;
  atEnd: boolean;
}

const RESTING_EDGES: ScrollEdges = { scrollable: false, atStart: true, atEnd: true };

export function resolveScrollEdges({
  scrollLeft,
  scrollWidth,
  clientWidth,
}: ScrollEdgeMetrics): ScrollEdges {
  const overflow = scrollWidth - clientWidth;
  if (overflow <= EDGE_TOLERANCE_PX) return RESTING_EDGES;
  const travelled = Math.abs(scrollLeft);
  return {
    scrollable: true,
    atStart: travelled <= EDGE_TOLERANCE_PX,
    atEnd: travelled >= overflow - EDGE_TOLERANCE_PX,
  };
}

function sameEdges(left: ScrollEdges, right: ScrollEdges): boolean {
  return (
    left.scrollable === right.scrollable &&
    left.atStart === right.atStart &&
    left.atEnd === right.atEnd
  );
}

export function useScrollEdges<ElementType extends HTMLElement>() {
  const ref = useRef<ElementType | null>(null);
  const [edges, setEdges] = useState<ScrollEdges>(RESTING_EDGES);

  const measure = useCallback(() => {
    const viewport = ref.current;
    if (!viewport) return;
    const next = resolveScrollEdges(viewport);
    setEdges((current) => (sameEdges(current, next) ? current : next));
  }, []);

  useEffect(() => {
    const viewport = ref.current;
    if (!viewport) return;
    measure();
    viewport.addEventListener('scroll', measure, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(viewport);
    const content = viewport.firstElementChild;
    if (content) observer?.observe(content);
    return () => {
      viewport.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [measure]);

  return { ref, measure, ...edges };
}
