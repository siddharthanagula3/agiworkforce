import Link from 'next/link';
import type { ReactNode } from 'react';

interface MonoButtonProps {
  variant?: 'primary' | 'ghost';
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  /** Visual prefix inside brackets, e.g. "./" or "→". */
  prefix?: string;
  /** For aria labelling when the bracket decoration adds noise. */
  'aria-label'?: string;
}

/**
 * [ ./install ] style square mono button.
 * Primary: ink-on-paper (paper section) or cream-on-graphite.
 * Ghost: transparent with amber rule border at 40% opacity.
 * Renders as <Link> when href is provided, <button> otherwise.
 */
export function MonoButton({
  variant = 'primary',
  href,
  onClick,
  children,
  prefix,
  'aria-label': ariaLabel,
}: MonoButtonProps): ReactNode {
  const label = [prefix, children].filter(Boolean).join(' ');
  const rendered = `[ ${label} ]`;

  const base = [
    'inline-flex items-center justify-center',
    'font-mono text-[14px] font-medium',
    'px-5 py-3',
    'rounded-none', // square, no rounding
    'transition-opacity duration-[var(--dur-fast)]',
    // focus ring
    'focus-visible:outline focus-visible:outline-2',
    'focus-visible:outline-[var(--color-rule)] focus-visible:outline-offset-2',
    'cursor-pointer',
  ].join(' ');

  const variants: Record<string, string> = {
    primary: ['bg-[var(--color-ink)] text-[var(--color-paper)]', 'hover:opacity-80'].join(' '),
    ghost: [
      'bg-transparent',
      'border border-[color:color-mix(in_srgb,var(--color-rule)_40%,transparent)]',
      'text-inherit',
      'hover:border-[var(--color-rule)] hover:opacity-80',
    ].join(' '),
  };

  const className = `${base} ${variants[variant]}`;

  if (href) {
    return (
      <Link href={href} className={className} aria-label={ariaLabel}>
        {rendered}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} aria-label={ariaLabel}>
      {rendered}
    </button>
  );
}
