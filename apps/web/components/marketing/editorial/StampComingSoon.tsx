import type { ReactNode } from 'react';

type StampVariant = 'coming-soon' | 'shipped' | 'waitlist';

interface StampComingSoonProps {
  text?: string;
  variant?: StampVariant;
}

const VARIANT_DEFAULTS: Record<StampVariant, { label: string; color: string }> = {
  'coming-soon': { label: 'COMING SOON', color: 'var(--color-stamp-oxblood)' },
  shipped: { label: 'SHIPPED', color: 'var(--color-stamp-ok)' },
  waitlist: { label: 'WAITLIST', color: 'var(--color-stamp-oxblood)' },
};

/**
 * Oxblood (or forest) rubber-stamp badge.
 * Slightly rotated for stamp feel; rotation removed under prefers-reduced-motion.
 */
export function StampComingSoon({
  text,
  variant = 'coming-soon',
}: StampComingSoonProps): ReactNode {
  const { label, color } = VARIANT_DEFAULTS[variant];
  const displayText = text ?? label;

  return (
    <span
      aria-label={displayText}
      className={[
        'inline-block',
        'font-mono text-[10px] font-semibold uppercase',
        'tracking-[0.15em]',
        'px-2 py-0.5',
        'border',
        // Rotate for stamp feel; disabled under reduced-motion
        'motion-safe:[transform:rotate(-2deg)]',
        'select-none',
      ].join(' ')}
      style={{
        color,
        borderColor: color,
      }}
    >
      {displayText}
    </span>
  );
}
