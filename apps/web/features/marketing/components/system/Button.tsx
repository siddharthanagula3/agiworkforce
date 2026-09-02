import Link from 'next/link';
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
    <Link href={href} className="agi-ds-btn" data-variant={variant}>
      {children}
    </Link>
  );
}

export function ButtonRow({ children }: { children: ReactNode }) {
  return <div className="agi-ds-btn-row">{children}</div>;
}
