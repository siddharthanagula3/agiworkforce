'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { Monitor, X } from 'lucide-react';

import { cn } from '@shared/lib/utils';
import {
  COMPUTER_USE_ON_WEB,
  describePlanAllowance,
  evaluateComputerUsePlan,
  listComputerUseExecutors,
  primaryExecutorCta,
} from './availability';
import { BROWSER_CONTROL_COPY, BROWSER_CONTROL_TEST_IDS, executorTestId } from './constants';

interface BrowserControlRequirementDialogProps {
  open: boolean;
  onClose: () => void;
  subscriptionTier: string | null | undefined;
  planKnown?: boolean;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
      {status}
    </span>
  );
}

export function BrowserControlRequirementDialog({
  open,
  onClose,
  subscriptionTier,
  planKnown = true,
}: BrowserControlRequirementDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreTo?.focus?.();
    };
  }, [open, onClose]);

  const executors = useMemo(() => listComputerUseExecutors(), []);
  const cta = useMemo(() => primaryExecutorCta(executors), [executors]);

  if (!open) return null;

  const planLine = describePlanAllowance(evaluateComputerUsePlan(subscriptionTier, planKnown));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={BROWSER_CONTROL_COPY.title}
      data-testid={BROWSER_CONTROL_TEST_IDS.dialog}
      className="fixed inset-0 z-[var(--z-modal,300)] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-background shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Monitor className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {BROWSER_CONTROL_COPY.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={BROWSER_CONTROL_COPY.dismiss}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <p className="text-sm text-muted-foreground">{COMPUTER_USE_ON_WEB.description}</p>
          <p className="text-sm text-muted-foreground">{BROWSER_CONTROL_COPY.lead}</p>
          <p className="text-sm text-muted-foreground">{BROWSER_CONTROL_COPY.handoffUnavailable}</p>

          <dl className="space-y-3 border-t border-border pt-4">
            <Row label={BROWSER_CONTROL_COPY.runsInLabel}>
              <ul className="space-y-1">
                {executors.map((executor) => (
                  <li key={executor.surface} data-testid={executorTestId(executor.surface)}>
                    {executor.href ? (
                      <Link href={executor.href} className="underline underline-offset-2">
                        {executor.label}
                      </Link>
                    ) : (
                      executor.label
                    )}
                    <StatusChip status={executor.status} />
                  </li>
                ))}
              </ul>
            </Row>
            <Row label={BROWSER_CONTROL_COPY.hereLabel}>
              <span
                data-testid={BROWSER_CONTROL_TEST_IDS.hereLine}
                className="text-muted-foreground"
              >
                {COMPUTER_USE_ON_WEB.statusLabel}
              </span>
            </Row>
            <Row label={BROWSER_CONTROL_COPY.sendsLabel}>
              <span className="text-muted-foreground">{BROWSER_CONTROL_COPY.sends}</span>
            </Row>
            <Row label={BROWSER_CONTROL_COPY.planLabel}>
              <span data-testid={BROWSER_CONTROL_TEST_IDS.planLine}>{planLine}</span>
            </Row>
            <Row label={BROWSER_CONTROL_COPY.billedLabel}>
              <span
                data-testid={BROWSER_CONTROL_TEST_IDS.billedLine}
                className="text-muted-foreground"
              >
                {BROWSER_CONTROL_COPY.billed}
              </span>
            </Row>
          </dl>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Link
            href={cta.href}
            data-testid={BROWSER_CONTROL_TEST_IDS.primaryCta}
            className={cn(
              'h-9 rounded-lg px-3 text-sm font-medium leading-9 transition-opacity',
              'bg-primary text-primary-foreground hover:opacity-90',
            )}
          >
            {cta.label}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default BrowserControlRequirementDialog;
