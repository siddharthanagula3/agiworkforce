import type { ReactNode } from 'react';

interface RuledSectionProps {
  tier: 'paper' | 'graphite';
  slug?: ReactNode;
  id?: string;
  fullBleed?: boolean;
  children: ReactNode;
}

/**
 * Page/landing section wrapper with editorial ruled borders.
 * Sets bg and text color by tier; thick amber rule at top, hairline at bottom.
 * Optional slug renders in the marginalia position (left, mono).
 */
export function RuledSection({
  tier,
  slug,
  id,
  fullBleed = false,
  children,
}: RuledSectionProps): ReactNode {
  const isPaper = tier === 'paper';

  const bg = isPaper ? 'bg-[var(--color-paper)]' : 'bg-[var(--color-graphite)]';

  const text = isPaper ? 'text-[var(--color-ink)]' : 'text-[var(--color-cream-on-graphite)]';

  return (
    <section
      id={id}
      data-rail-slug={slug ? String(slug) : undefined}
      className={[
        'relative w-full',
        bg,
        text,
        // Thick amber top rule (2px), hairline bottom rule (1px)
        'border-t-2 border-t-[var(--color-rule)]',
        'border-b border-b-[var(--color-rule)]',
      ].join(' ')}
    >
      {/* Marginalia slug — visible left of content on md+ */}
      {slug && (
        <div
          className={[
            'hidden md:block',
            'absolute left-4 top-6',
            'font-mono text-[11px] uppercase tracking-[0.18em]',
            isPaper ? 'text-[var(--color-fg-quiet)]' : 'text-[var(--color-fg-muted)]',
          ].join(' ')}
          aria-hidden="true"
        >
          {slug}
        </div>
      )}

      {/* Inner content container */}
      <div className={fullBleed ? 'w-full' : 'container mx-auto px-4'}>{children}</div>
    </section>
  );
}
