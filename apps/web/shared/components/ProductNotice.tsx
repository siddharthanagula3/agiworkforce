'use client';

import type { ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';

export type ProductNoticeTone = 'danger' | 'warning' | 'info';

const ICON_TONE: Readonly<Record<ProductNoticeTone, string>> = {
  danger: 'text-danger-text',
  warning: 'text-warning-text',
  info: 'text-info-text',
};

export function ProductNoticeStack({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[var(--z-notification)] flex flex-col items-center gap-2 px-4 pt-14">
      {children}
    </div>
  );
}

interface ProductNoticeCardProps {
  icon: LucideIcon;
  tone: ProductNoticeTone;
  message: string;
  action?: ReactNode;
  onDismiss?: () => void;
}

export function ProductNoticeCard({
  icon: Icon,
  tone,
  message,
  action,
  onDismiss,
}: ProductNoticeCardProps) {
  return (
    <div
      role={tone === 'info' ? 'status' : 'alert'}
      className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-lg border border-border bg-popover px-4 py-3 text-sm text-foreground shadow-sm"
    >
      <Icon className={`h-4 w-4 shrink-0 ${ICON_TONE[tone]}`} aria-hidden="true" />
      <p className="min-w-0 flex-1">{message}</p>
      {action}
      {onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss this notice"
          onClick={onDismiss}
          className="flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
