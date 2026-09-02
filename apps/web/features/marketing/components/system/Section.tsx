import type { ReactNode } from 'react';
import { Container } from './Container';

export type SectionSize = 'xs' | 'sm' | 'md' | 'lg';

export function Section({
  children,
  id,
  labelledBy,
  size = 'md',
  rule = false,
  ground,
  className,
}: {
  children: ReactNode;
  id?: string;
  labelledBy?: string;
  size?: SectionSize;
  rule?: boolean;
  ground?: '2';
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={['agi-ds-section', className].filter(Boolean).join(' ')}
      data-size={size}
      data-rule={rule ? 'top' : undefined}
      data-ground={ground}
    >
      <Container>{children}</Container>
    </section>
  );
}
