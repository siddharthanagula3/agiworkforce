import type { ReactNode } from 'react';

export function Eyebrow({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <span className="agi-ds-eyebrow" id={id}>
      {children}
    </span>
  );
}
