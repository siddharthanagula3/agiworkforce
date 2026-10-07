'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/features/marketing/components/motion/motionPreferences';

const COUNT_MS = 600;
const DONE = 1;
const START = 0;
const LABEL = 'Product facts';

const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

function split(value: string): { number: number; suffix: string } {
  const match = /^(\d+)(.*)$/.exec(value);
  if (!match) return { number: Number.NaN, suffix: value };
  return { number: Number(match[1]), suffix: match[2] ?? '' };
}

export function Facts({ facts }: { facts: ReadonlyArray<{ value: string; label: string }> }) {
  const ref = useRef<HTMLUListElement>(null);
  const [progress, setProgress] = useState(DONE);

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion()) return;
    setProgress(START);
    let frame = 0;
    let begin = 0;
    const tick = (now: number) => {
      if (begin === 0) begin = now;
      const t = Math.min(DONE, (now - begin) / COUNT_MS);
      setProgress(easeOut(t));
      if (t < DONE) frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      frame = requestAnimationFrame(tick);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <ul ref={ref} className="f1-facts" aria-label={LABEL}>
      {facts.map((fact) => {
        const { number, suffix } = split(fact.value);
        const shown = Number.isNaN(number)
          ? fact.value
          : `${Math.round(number * progress)}${suffix}`;
        return (
          <li key={fact.label} className="f1-fact">
            <span className="f1-fact-value">{shown}</span>
            <span className="f1-fact-label">{fact.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
