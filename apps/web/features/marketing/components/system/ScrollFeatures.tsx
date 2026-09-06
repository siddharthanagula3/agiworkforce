'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Checklist } from './Checklist';

export interface ScrollFeature {
  id: string;
  eyebrow?: string;
  title: string;
  body: string;
  points?: readonly string[];
  visual: ReactNode;
}

const ACTIVE_LINE = '-45% 0px -45% 0px';

export function ScrollFeatures({
  features,
  label,
}: {
  features: readonly ScrollFeature[];
  label: string;
}) {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = refs.current.indexOf(entry.target as HTMLElement);
          if (index >= 0) setActive(index);
        }
      },
      { rootMargin: ACTIVE_LINE, threshold: 0 },
    );
    for (const node of refs.current) if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [features.length]);

  return (
    <div className="agi-ds-scrollfeatures" aria-label={label}>
      <div className="agi-ds-scrollfeatures-list">
        {features.map((feature, index) => (
          <article
            className="agi-ds-scrollfeature"
            data-active={index === active ? 'true' : undefined}
            id={feature.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            key={feature.id}
          >
            {feature.eyebrow ? <p className="agi-ds-eyebrow">{feature.eyebrow}</p> : null}
            <h3 className="agi-ds-scrollfeature-title">{feature.title}</h3>
            <p className="agi-ds-scrollfeature-body">{feature.body}</p>
            {feature.points ? <Checklist items={feature.points} /> : null}
            <div className="agi-ds-scrollfeature-visual agi-ds-scrollfeature-visual--inline">
              {feature.visual}
            </div>
          </article>
        ))}
      </div>
      <div className="agi-ds-scrollfeatures-stage" aria-hidden="true">
        {features.map((feature, index) => (
          <div
            className="agi-ds-scrollfeature-visual"
            data-active={index === active ? 'true' : undefined}
            key={feature.id}
          >
            {feature.visual}
          </div>
        ))}
      </div>
    </div>
  );
}
