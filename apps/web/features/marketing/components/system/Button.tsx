import { PageLink } from '@shared/components/layout/EmbeddedPage';
import type { ReactNode } from 'react';

export function Button({
  href,
  children,
  variant = 'primary',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <PageLink href={href} className="agi-ds-btn" data-variant={variant} omitWhenEmbedded>
      {children}
    </PageLink>
  );
}

export function ButtonRow({ children }: { children: ReactNode }) {
  return <div className="agi-ds-btn-row">{children}</div>;
}
