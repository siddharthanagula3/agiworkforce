'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, type LucideIcon } from 'lucide-react';
import { useProductNoticeHost } from './ProductNoticeHost';

export type ProductNoticeTone = 'danger' | 'warning' | 'info';

const ICON_TONE: Readonly<Record<ProductNoticeTone, string>> = {
  danger: 'text-danger-text',
  warning: 'text-warning-text',
  info: 'text-info-text',
};

export function ProductNoticeStack({ children }: { children: ReactNode }) {
  const host = useProductNoticeHost();
  const stackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const stack = stackRef.current;
    const shell = host?.parentElement;
    if (!stack || !shell) return;
    const updateInset = () => {
      const header = shell.querySelector('[data-app-header], [data-quick-ask-header]');
      const inset = stack.childElementCount
        ? Math.max(
            0,
            stack.getBoundingClientRect().bottom - (header?.getBoundingClientRect().bottom ?? 0),
          )
        : 0;
      shell.style.setProperty('--agi-product-notice-inset', `${Math.ceil(inset)}px`);
    };
    updateInset();
    const observer = new ResizeObserver(updateInset);
    observer.observe(stack);
    window.addEventListener('resize', updateInset);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateInset);
      shell.style.removeProperty('--agi-product-notice-inset');
    };
  }, [host]);

  const stack = (
    <div
      ref={stackRef}
      data-product-notice-stack=""
      className="pointer-events-none fixed inset-x-0 top-14 z-[var(--z-banner)] flex max-h-[max(0px,calc(40dvh-3.5rem))] flex-col items-center gap-2 overflow-y-auto overscroll-contain px-4 [scrollbar-width:thin]"
    >
      {children}
    </div>
  );
  return host ? createPortal(stack, host) : stack;
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
      className="pointer-events-auto flex w-full max-w-3xl shrink-0 items-center gap-3 rounded-lg border border-border bg-popover px-4 py-3 text-sm text-foreground shadow-sm"
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
