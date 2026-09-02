'use client';

import { useMotionValueEvent, useScroll } from 'framer-motion';
import { useRef, useState, type ReactNode } from 'react';
import { LaneLabel } from './LaneLabel';
import type { LaneId } from './lanes';

export interface StickyLedgerPanel {
  lane: LaneId;
  title: string;
  body: ReactNode;
}

export function StickyLedger({
  heading,
  panels,
}: {
  heading?: ReactNode;
  panels: readonly StickyLedgerPanel[];
}) {
  const flow = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({
    target: flow,
    offset: ['start center', 'end center'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const step = Math.floor(progress * panels.length);
    setActive(Math.max(0, Math.min(panels.length - 1, step)));
  });

  return (
    <div className="agi-ds-sticky-scene">
      <div className="agi-ds-sticky-pane">
        {heading}
        <ol className="agi-ds-lane-rail">
          {panels.map((panel, index) => (
            <li
              className="agi-ds-lane-rail-item"
              data-lane={panel.lane}
              data-active={index === active ? 'true' : 'false'}
              key={panel.lane}
            >
              <LaneLabel lane={panel.lane} />
              <span className="agi-ds-lane-rail-title">{panel.title}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="agi-ds-sticky-flow" ref={flow}>
        {panels.map((panel, index) => (
          <section
            className="agi-ds-lane-panel"
            data-lane={panel.lane}
            data-active={index === active ? 'true' : 'false'}
            key={panel.lane}
            aria-label={panel.title}
          >
            {panel.body}
          </section>
        ))}
      </div>
    </div>
  );
}
