'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { canPinDeck, onPinnableChange, prefersReducedMotion } from './motionPreferences';

const ACTIVE_ATTR = 'data-active';
const STAGE_SLOT = 'stage';
const COPY_SLOT = 'copy';
const INLINE_SLOT = 'inline';

export type DeckItem = { id: string; copy: ReactNode; visual: ReactNode };

export function ScrollDeck({ items, label }: { items: readonly DeckItem[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    setPinned(canPinDeck());
    const stopListening = onPinnableChange(setPinned);
    const markers = Array.from(node.querySelectorAll<HTMLElement>('[data-deck-marker]'));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number(entry.target.getAttribute('data-deck-marker'));
          if (!Number.isNaN(index)) setActive(index);
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    for (const marker of markers) observer.observe(marker);
    return () => {
      observer.disconnect();
      stopListening();
    };
  }, [items.length]);

  return (
    <div
      ref={ref}
      className="agi-mx-deck"
      data-pinned={pinned ? 'true' : undefined}
      role="group"
      aria-label={label}
    >
      <div className="agi-mx-deck-stage" aria-hidden={pinned ? 'true' : undefined}>
        {items.map((item, index) => (
          <div
            key={item.id}
            className="agi-mx-deck-card"
            {...{ [ACTIVE_ATTR]: index === active ? 'true' : undefined }}
            data-offset={index - active}
          >
            <Fragment key={STAGE_SLOT}>{item.visual}</Fragment>
          </div>
        ))}
      </div>
      <ol className="agi-mx-deck-copy">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="agi-mx-deck-step"
            data-deck-marker={index}
            {...{ [ACTIVE_ATTR]: index === active ? 'true' : undefined }}
          >
            <Fragment key={COPY_SLOT}>{item.copy}</Fragment>
            {pinned ? null : (
              <div key={INLINE_SLOT} className="agi-mx-deck-inline">
                {item.visual}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
