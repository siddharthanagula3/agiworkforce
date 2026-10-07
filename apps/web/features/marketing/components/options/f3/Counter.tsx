'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../motion/motionPreferences';

const DURATION_MS = 600;
const NUMBER_RE = /^(\d+)(.*)$/;

export function Counter({ value }: { value: string }) {
  const match = NUMBER_RE.exec(value);
  const target = match ? Number(match[1]) : 0;
  const suffix = match ? (match[2] ?? '') : value;
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(target);

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    let frame = 0;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / DURATION_MS);
        const eased = 1 - (1 - progress) ** 3;
        setShown(Math.round(target * eased));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [target]);

  return (
    <span ref={ref} className="f3-fact-num">
      {shown}
      {suffix}
    </span>
  );
}
