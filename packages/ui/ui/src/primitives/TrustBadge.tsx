'use client';

import * as React from 'react';
import { Cloud, KeyRound, Lock, type LucideIcon } from 'lucide-react';
import { cn } from '../cn';

export type TrustBadgeBoundary = 'local' | 'byok' | 'managed';

const BOUNDARY_TEXT: Record<TrustBadgeBoundary, string> = {
  local: 'text-[var(--success-text)]',
  byok: 'text-[var(--warning-text)]',
  managed: 'text-[var(--info-text)]',
};

const BOUNDARY_ICON: Record<TrustBadgeBoundary, LucideIcon> = {
  local: Lock,
  byok: KeyRound,
  managed: Cloud,
};

export interface TrustBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  boundary: TrustBadgeBoundary;
  label: string;
  showIcon?: boolean;
}

function TrustBadge({ boundary, label, showIcon = true, className, ...props }: TrustBadgeProps) {
  const Icon = BOUNDARY_ICON[boundary];
  return (
    <span
      data-trust-boundary={boundary}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-[var(--chat-border)] bg-[var(--chat-surface-base)] px-2 py-0.5 text-[12px] font-medium',
        BOUNDARY_TEXT[boundary],
        className,
      )}
      {...props}
    >
      {showIcon ? <Icon className="h-3 w-3" aria-hidden /> : null}
      <span>{label}</span>
    </span>
  );
}
TrustBadge.displayName = 'TrustBadge';

export { TrustBadge };
