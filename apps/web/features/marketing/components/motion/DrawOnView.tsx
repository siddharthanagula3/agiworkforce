'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { prefersReducedMotion } from './motionPreferences';

const DRAWN = 'is-drawn';
const VISIBLE_THRESHOLD = 0.3;

export function DrawOnView({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      node.classList.add(DRAWN);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        node.classList.add(DRAWN);
        observer.disconnect();
      },
      { threshold: VISIBLE_THRESHOLD },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={['agi-mx-draw', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
