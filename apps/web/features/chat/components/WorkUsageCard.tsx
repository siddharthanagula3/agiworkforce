'use client';

import { useId, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@agiworkforce/ui';
import { WORK_USAGE_COPY } from '@agiworkforce/types';
import { TopUpPanel } from '@/features/billing/components/TopUpPanel';

export interface WorkUsageCardAction {
  label: string;
  onSelect: () => void;
}

export interface WorkUsageCardProps {
  creditTopUpTier?: string | undefined;
  action?: WorkUsageCardAction | undefined;
  resetLabel?: string | null | undefined;
  footer?: ReactNode;
}

export function WorkUsageCard({ creditTopUpTier, action, resetLabel, footer }: WorkUsageCardProps) {
  const titleId = useId();
  const [addCreditsOpen, setAddCreditsOpen] = useState(false);
  const canAddCredits = typeof creditTopUpTier === 'string' && creditTopUpTier.length > 0;
  const body = WORK_USAGE_COPY.body[canAddCredits ? 'add_credits' : 'wait'];

  return (
    <section
      role="alert"
      aria-labelledby={titleId}
      data-testid="work-usage-card"
      className="mb-2 flex flex-col gap-3 rounded-2xl border border-[var(--chat-border-subtle)] bg-[var(--chat-surface-elevated)] px-4 py-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-base font-semibold text-[var(--chat-text-primary)]">
          {WORK_USAGE_COPY.title}
        </h2>
        <p className="text-sm text-[var(--chat-text-secondary)]">{body}</p>
        {resetLabel ? (
          <p className="text-sm text-[var(--chat-text-secondary)]">{resetLabel}.</p>
        ) : null}
      </div>
      {canAddCredits ? (
        <Button
          type="button"
          className="w-full rounded-full font-semibold"
          onClick={() => setAddCreditsOpen(true)}
        >
          {WORK_USAGE_COPY.addCredits}
        </Button>
      ) : action ? (
        <Button
          type="button"
          className="w-full rounded-full font-semibold"
          onClick={action.onSelect}
        >
          {action.label}
        </Button>
      ) : null}
      {footer ? (
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-[var(--chat-text-secondary)]">
          {footer}
        </div>
      ) : null}
      {canAddCredits ? (
        <Dialog open={addCreditsOpen} onOpenChange={setAddCreditsOpen}>
          <DialogContent className="w-[min(94vw,30rem)] border-border/70 bg-background sm:rounded-2xl">
            <DialogHeader className="sr-only">
              <DialogTitle>{WORK_USAGE_COPY.addCredits}</DialogTitle>
              <DialogDescription>{WORK_USAGE_COPY.body.add_credits}</DialogDescription>
            </DialogHeader>
            <TopUpPanel tier={creditTopUpTier} canBuy />
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}
