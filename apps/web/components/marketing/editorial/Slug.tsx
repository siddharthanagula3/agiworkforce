import type { ReactNode } from 'react';

interface SlugProps {
  index: string | number;
  kicker: string;
  date?: string;
}

/**
 * Section slug: § NN · KICKER · 2026.05.05
 * JetBrains Mono 11px, spaced uppercase, muted ink.
 */
export function Slug({ index, kicker, date = '2026.05.05' }: SlugProps): ReactNode {
  const idx = typeof index === 'number' ? String(index).padStart(2, '0') : index;

  return (
    <aside
      aria-label={`Section ${idx}: ${kicker}`}
      className={[
        'font-mono text-[11px] uppercase tracking-[0.18em]',
        'text-[var(--color-fg-quiet)]',
        'select-none',
      ].join(' ')}
    >
      § {idx} · {kicker} · {date}
    </aside>
  );
}
