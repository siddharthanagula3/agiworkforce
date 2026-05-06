import type { ReactNode } from 'react';

interface DatelineProps {
  volume?: string;
  number?: string;
  date?: string;
  edition?: string;
}

/**
 * Top-strip masthead: AGI WORKFORCE · VOL. I · NO. 03 · 2026.05.05 · LATE EDITION
 * JetBrains Mono 11px, centered, hairline amber rule below.
 */
export function Dateline({
  volume = 'VOL. I',
  number = 'NO. 03',
  date,
  edition = 'LATE EDITION',
}: DatelineProps): ReactNode {
  const buildDate = date ?? (process.env['NEXT_BUILD_DATE'] as string | undefined) ?? '2026.05.05';

  const segments = ['AGI WORKFORCE', volume, number, buildDate, edition];

  return (
    <header
      className={[
        'w-full py-2 px-4',
        'font-mono text-[11px] uppercase tracking-[0.18em]',
        'text-[var(--color-fg-quiet)]',
        'border-b border-[var(--color-rule)]',
        'text-center',
      ].join(' ')}
      aria-label="Publication dateline"
    >
      {segments.join(' · ')}
    </header>
  );
}
