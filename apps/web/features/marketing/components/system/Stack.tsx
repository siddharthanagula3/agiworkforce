import type { ReactNode } from 'react';

export function Stack({
  children,
  gap = 'base',
  className,
}: {
  children: ReactNode;
  gap?: 'tight' | 'base' | 'loose';
  className?: string;
}) {
  return (
    <div className={['agi-ds-stack', className].filter(Boolean).join(' ')} data-gap={gap}>
      {children}
    </div>
  );
}
