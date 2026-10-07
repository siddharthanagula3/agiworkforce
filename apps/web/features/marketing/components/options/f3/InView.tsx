'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { prefersReducedMotion } from '../../motion/motionPreferences';

const DEFAULT_THRESHOLD = 0.25;

export function InView({
  as: Tag = 'div',
  className,
  threshold = DEFAULT_THRESHOLD,
  children,
  ...rest
}: {
  as?: 'div' | 'section';
  className?: string;
  threshold?: number;
  children: ReactNode;
  id?: string;
  'aria-labelledby'?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setSeen(true);
        observer.disconnect();
      },
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <Tag
      ref={(node: HTMLElement | null) => {
        ref.current = node;
      }}
      className={className}
      data-in={seen ? 'true' : 'false'}
      {...rest}
    >
      {children}
    </Tag>
  );
}
