'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './motionPreferences';

const CHAR_MS = 14;
const LINE_PAUSE_MS = 220;
const VISIBLE_THRESHOLD = 0.4;

export type TypedLine = { kind: 'cmd' | 'out' | 'dim' | 'ok'; text: string };

export type TypedLineClasses = {
  line?: string;
  kinds?: Partial<Record<TypedLine['kind'], string>>;
};

export function Typewriter({
  lines,
  label,
  className,
  classes,
}: {
  lines: readonly TypedLine[];
  label: string;
  className?: string;
  classes?: TypedLineClasses;
}) {
  const ref = useRef<HTMLPreElement>(null);
  const [progress, setProgress] = useState<{ line: number; chars: number } | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setProgress({ line: lines.length, chars: 0 });
      return;
    }
    let frame = 0;
    let started = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (started || !entries.some((entry) => entry.isIntersecting)) return;
        started = true;
        observer.disconnect();
        const startedAt = performance.now();
        const schedule: number[] = [];
        let at = 0;
        for (const line of lines) {
          at += line.text.length * CHAR_MS + LINE_PAUSE_MS;
          schedule.push(at);
        }
        const tick = (now: number) => {
          const elapsed = now - startedAt;
          let line = 0;
          while (line < lines.length && elapsed >= schedule[line]!) line += 1;
          if (line >= lines.length) {
            setProgress({ line: lines.length, chars: 0 });
            return;
          }
          const lineStart = line === 0 ? 0 : schedule[line - 1]!;
          const chars = Math.min(
            lines[line]!.text.length,
            Math.floor((elapsed - lineStart) / CHAR_MS),
          );
          setProgress({ line, chars });
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: VISIBLE_THRESHOLD },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [lines]);

  const done = progress?.line ?? -1;

  return (
    <pre
      ref={ref}
      className={['agi-mx-typed', className].filter(Boolean).join(' ')}
      aria-label={label}
      data-typing={progress !== null && done < lines.length ? 'true' : undefined}
    >
      {lines.map((line, index) => {
        const complete = index < done;
        const active = index === done;
        if (!complete && !active) return null;
        const text = complete ? line.text : line.text.slice(0, progress?.chars ?? 0);
        return (
          <span
            key={`${index}-${line.text}`}
            className={['agi-mx-typed-line', classes?.line, classes?.kinds?.[line.kind]]
              .filter(Boolean)
              .join(' ')}
            data-kind={line.kind}
            data-active={active ? 'true' : undefined}
          >
            {text}
          </span>
        );
      })}
    </pre>
  );
}
