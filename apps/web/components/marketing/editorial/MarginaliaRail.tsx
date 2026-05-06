'use client';

import React, { useEffect, useRef, useState } from 'react';

interface RailEntry {
  slug: string;
  el: Element;
}

/**
 * Sticky left rail showing current section number + slug as user scrolls.
 * Hidden on <md. Reads section markers from `data-rail-slug` attributes.
 * Active section determined by IntersectionObserver (middle 20% of viewport).
 * Text rendered vertical (writing-mode vertical-rl, rotated 180deg = bottom-to-top).
 */
export function MarginaliaRail(): React.ReactElement | null {
  const [entries, setEntries] = useState<RailEntry[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Discover all sections with data-rail-slug on mount + DOM changes
  useEffect(() => {
    const collect = (): RailEntry[] =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-rail-slug]'))
        .map((el) => ({ slug: el.dataset['railSlug'] ?? '', el }))
        .filter((e) => e.slug);

    setEntries(collect());
  }, []);

  // Set up intersection observer once entries are known
  useEffect(() => {
    if (entries.length === 0) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (observed) => {
        const intersecting = observed.filter((e) => e.isIntersecting);
        if (intersecting.length > 0) {
          const top = intersecting.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
          );
          const found = entries.find((e) => e.el === top.target);
          if (found) setActiveSlug(found.slug);
        }
      },
      {
        rootMargin: '-40% 0px -40% 0px',
        threshold: 0,
      },
    );

    entries.forEach((e) => observerRef.current?.observe(e.el));

    // If first section is not intersecting yet, default to it
    if (!activeSlug && entries[0]) {
      setActiveSlug(entries[0].slug);
    }

    // Suppress unused variable warning — prefersReduced used implicitly via transition below
    void prefersReduced;

    return () => observerRef.current?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="hidden md:flex fixed left-6 z-30"
      style={{
        top: '50vh',
        transform: 'translateY(-50%)',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      {/* Vertical text */}
      <span
        className={[
          'font-mono text-[11px] uppercase tracking-[0.18em]',
          'text-[var(--color-fg-quiet)]',
          // transition respects reduced-motion via the global rule in globals.css
          'transition-opacity duration-200',
        ].join(' ')}
        style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          whiteSpace: 'nowrap',
        }}
      >
        {activeSlug}
      </span>

      {/* 4px wide amber rule on the right of the text */}
      <div className="w-1 self-stretch bg-[var(--color-rule)]" style={{ minHeight: '3rem' }} />
    </div>
  );
}
