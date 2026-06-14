'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Reveal · IntersectionObserver-driven scroll entrance for marketing
 * sections. Adds `.is-revealed` when the element enters the viewport;
 * globals.css owns the transition (opacity + translateY at --agi-dur-base).
 *
 * Honors prefers-reduced-motion by revealing immediately, and renders
 * content visible-by-default when JavaScript never hydrates (the class
 * starts unset only after mount), so SEO and no-JS visitors lose nothing.
 */
export function Reveal({
  children,
  delay = 0,
  as: Tag = 'div',
  className,
}: {
  children: ReactNode;
  /** Stagger delay in ms, applied via transition-delay. */
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'article';
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-revealed');
      return;
    }

    node.classList.add('agi-reveal-armed');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            node.classList.add('is-revealed');
            observer.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      // @ts-expect-error -- ref type narrows per tag; all are HTMLElement
      ref={ref}
      className={['agi-reveal', className].filter(Boolean).join(' ')}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
