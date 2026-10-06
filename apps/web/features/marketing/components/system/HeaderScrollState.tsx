'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function HeaderScrollState({ children }: { children: ReactNode }) {
  const header = useRef<HTMLElement>(null);

  useEffect(() => {
    const update = () => {
      if (!header.current) return;
      if (window.scrollY > 0) {
        header.current.dataset['scrolled'] = 'true';
      } else {
        delete header.current.dataset['scrolled'];
      }
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <header ref={header} className="agi-ds-header">
      <div className="agi-ds-header-surface">{children}</div>
    </header>
  );
}
