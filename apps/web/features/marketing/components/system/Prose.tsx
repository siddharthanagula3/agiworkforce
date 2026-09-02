import type { ReactNode } from 'react';

export function Prose({
  children,
  size = 'md',
  tone,
  className,
}: {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'ink';
  className?: string;
}) {
  return (
    <p
      className={['agi-ds-prose', className].filter(Boolean).join(' ')}
      data-size={size}
      data-tone={tone}
    >
      {children}
    </p>
  );
}
