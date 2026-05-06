'use client';

import React, { useEffect, useRef } from 'react';

interface OpsizMorphProps {
  as?: 'h2' | 'h3';
  from?: number;
  to?: number;
  children: React.ReactNode;
  className?: string;
}

/**
 * Scroll-driven optical-size morph for headings.
 * CSS animation-timeline: view() where supported.
 * JS IntersectionObserver fallback otherwise.
 * Morphs font-variation-settings "opsz" from `from` to `to` (default 36→56).
 */
export function OpsizMorph({
  as: Tag = 'h2',
  from = 36,
  to = 56,
  children,
  className = '',
}: OpsizMorphProps): React.ReactElement {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Check if CSS scroll-timeline is supported; if so, let CSS handle it.
    // We only attach the JS fallback when scroll-driven animations are NOT supported.
    const supportsScrollTimeline =
      typeof CSS !== 'undefined' && CSS.supports('animation-timeline', 'view()');

    if (supportsScrollTimeline) return;

    // JS fallback: morph opsz once when heading enters viewport
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      el.style.fontVariationSettings = `"opsz" ${to}`;
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.style.transition = `font-variation-settings var(--dur-slow) var(--ease-out-expo)`;
            el.style.fontVariationSettings = `"opsz" ${to}`;
            observer.disconnect();
          }
        });
      },
      { rootMargin: '0px 0px -20% 0px', threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [from, to]);

  // CSS custom properties for the keyframe animation.
  // animationTimeline and animationRange are scroll-driven animation properties —
  // React.CSSProperties may not include them; cast to unknown first to avoid TS4111.
  const style = {
    fontVariationSettings: `"opsz" ${from}`,
    '--opsz-from': from,
    '--opsz-to': to,
    animationName: 'opsz-morph',
    animationTimeline: 'view()',
    animationRange: 'entry 0% entry 60%',
    animationFillMode: 'both',
  } as React.CSSProperties;

  return (
    <Tag ref={ref} className={`font-display ${className}`} style={style}>
      {children}
    </Tag>
  );
}
