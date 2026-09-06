'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useScrollEdges } from './use-scroll-edges';

export interface ScrollableTableProps {
  label: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function ScrollableTable({ label, children, className, style }: ScrollableTableProps) {
  const { ref, scrollable, atStart, atEnd } = useScrollEdges<HTMLDivElement>();

  return (
    <div
      className={['agi-ds-table-scroll', className].filter(Boolean).join(' ')}
      style={style}
      data-scrollable={scrollable || undefined}
      data-at-start={atStart || undefined}
      data-at-end={atEnd || undefined}
    >
      <div
        aria-label={label}
        className="agi-ds-compare-table-wrap"
        ref={ref}
        role="region"
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
