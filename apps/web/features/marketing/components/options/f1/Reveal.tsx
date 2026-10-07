'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { prefersReducedMotion } from '@/features/marketing/components/motion/motionPreferences';

const ROOT_MARGIN = '0px 0px -12% 0px';

export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion()) {
      node.dataset['in'] = 'true';
      return;
    }
    node.dataset['ready'] = 'true';
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        node.dataset['in'] = 'true';
        observer.disconnect();
      },
      { rootMargin: ROOT_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className ? `f1-reveal ${className}` : 'f1-reveal'}>
      {children}
    </div>
  );
}
