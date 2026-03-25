'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface Stat {
  value: number;
  suffix: string;
  label: string;
  description: string;
}

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

export function AnimatedStats({ stats }: { stats: Stat[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [counts, setCounts] = useState(stats.map(() => 0));
  const triggered = useRef(false);

  const runCounters = useCallback(() => {
    const duration = 2200;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = easeOutQuart(progress);
      setCounts(stats.map((s) => Math.round(s.value * eased)));
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }, [stats]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !triggered.current) {
          triggered.current = true;
          runCounters();
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [runCounters]);

  return (
    <div ref={ref} className="container mx-auto px-4">
      <div className="grid grid-cols-2 gap-10 md:grid-cols-4 md:gap-16">
        {stats.map((stat, i) => (
          <div key={stat.label} className="text-center">
            <div className="font-heading text-5xl tracking-tight text-[#edebe8] md:text-6xl lg:text-7xl">
              {(counts[i] ?? 0).toLocaleString()}
              <span className="text-[#c8892a]">{stat.suffix}</span>
            </div>
            <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#c8892a]">
              {stat.label}
            </div>
            <div className="mt-1 text-sm text-[#555150]">{stat.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
