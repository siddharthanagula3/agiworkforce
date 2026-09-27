'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from '@agiworkforce/ui';
import {
  getBillingPlanPricing,
  grandfatheredYearlyBillingNotice,
  type SelfServeIndividualPlanTier,
} from '@agiworkforce/types';
import { toUserMessage } from '@/lib/user-error-message';
import type { DowngradeBlock, PlanChangeState } from '../lib/billing-account-types';
import { formatBillingDate, formatRecurringMoney } from '../lib/billing-format';
import { summarizePlanChange, type PlanValueChange } from '../lib/plan-display';
import { fetchPlanChangeState, scheduleDowngrade } from '../services/billing-account';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; state: PlanChangeState }
  | { status: 'error'; message: string };

export interface DowngradeReviewDialogProps {
  open: boolean;
  initialPlan?: SelfServeIndividualPlanTier | null;
  onClose: () => void;
  onScheduled: (state: PlanChangeState) => void;
}

function blockedMessage(block: DowngradeBlock, state: PlanChangeState): string {
  const current = getBillingPlanPricing(state.plan).label;
  if (block === 'pending_cancellation') {
    const endsOn = formatBillingDate(state.cancelAt);
    return `Your ${current} plan is set to end${endsOn ? ` on ${endsOn}` : ''}. Resume it in Billing first, then choose a smaller plan.`;
  }
  if (block === 'organization_plan') {
    return 'Team and Enterprise plans change in Manage billing, so seats and member access stay in step.';
  }
  return `${current} is the smallest paid plan. To stop paying for it, cancel it in Billing.`;
}

function ChangeRows({ title, rows }: { title: string; rows: PlanValueChange[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <dl className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="tabular-nums">
              {row.from} <span aria-hidden="true">→</span>
              <span className="sr-only">becomes</span> {row.to}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function DowngradeReviewDialog({
  open,
  initialPlan = null,
  onClose,
  onScheduled,
}: DowngradeReviewDialogProps) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [selected, setSelected] = useState<SelfServeIndividualPlanTier | null>(initialPlan);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    setError(null);
    setSubmitting(false);
    fetchPlanChangeState()
      .then((state) => {
        if (cancelled) return;
        setLoad({ status: 'ready', state });
        setSelected(
          state.downgradeTargets.some((target) => target.plan === initialPlan)
            ? initialPlan
            : (state.downgradeTargets[0]?.plan ?? null),
        );
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setLoad({
          status: 'error',
          message: toUserMessage(cause, 'Your plan options could not be loaded.'),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, initialPlan]);

  if (!open) return null;

  const state = load.status === 'ready' ? load.state : null;
  const target = state?.downgradeTargets.find((entry) => entry.plan === selected) ?? null;
  const currentLabel = state ? getBillingPlanPricing(state.plan).label : '';
  const targetLabel = target ? getBillingPlanPricing(target.plan).label : '';
  const effectiveOn = formatBillingDate(state?.periodEnd);
  const summary = state && target ? summarizePlanChange(state.plan, target.plan) : null;
  const scheduled = state?.scheduledChange ?? null;
  const grandfatheredNotice =
    state?.price?.interval === 'yearly' ? grandfatheredYearlyBillingNotice(state.plan) : null;

  async function confirm() {
    if (!target || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      onScheduled(await scheduleDowngrade(target.plan));
    } catch (cause) {
      setError(
        toUserMessage(cause, 'The plan change could not be scheduled. Nothing was changed.'),
      );
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !submitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target ? `Switch to ${targetLabel}` : 'Switch to a smaller plan'}
          </DialogTitle>
          <DialogDescription>
            {load.status === 'loading'
              ? 'Checking your plan…'
              : load.status === 'error'
                ? load.message
                : state?.downgradeBlock
                  ? blockedMessage(state.downgradeBlock, state)
                  : !target
                    ? 'No smaller plan is available in your billing currency right now.'
                    : `${targetLabel} starts ${effectiveOn ? `on ${effectiveOn}, ` : ''}at the end of your current billing period. You keep ${currentLabel} and its credits until then, and nothing is charged today.`}
          </DialogDescription>
        </DialogHeader>

        {load.status === 'loading' ? (
          <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="sm" aria-hidden="true" />
            <span>Loading plan options</span>
          </div>
        ) : null}

        {state && !state.downgradeBlock && state.downgradeTargets.length > 1 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Plan</legend>
            {state.downgradeTargets.map((entry) => (
              <label
                key={entry.plan}
                className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-[var(--chat-accent-primary)] pointer-coarse:min-h-11"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="downgrade-target"
                    value={entry.plan}
                    checked={selected === entry.plan}
                    onChange={() => setSelected(entry.plan)}
                    className="h-4 w-4 accent-[var(--chat-accent-primary)]"
                  />
                  {getBillingPlanPricing(entry.plan).label}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatRecurringMoney(
                    entry.price.amountCents,
                    entry.price.currency,
                    entry.price.interval,
                  )}
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {state && target && summary ? (
          <section
            aria-label={`What changes on ${targetLabel}`}
            className="flex flex-col gap-4 rounded-lg border border-border p-4 text-sm"
          >
            <ChangeRows
              title="Price"
              rows={
                state.price
                  ? [
                      {
                        label: 'Plan price, plus tax',
                        from: formatRecurringMoney(
                          state.price.amountCents,
                          state.price.currency,
                          state.price.interval,
                        ),
                        to: formatRecurringMoney(
                          target.price.amountCents,
                          target.price.currency,
                          target.price.interval,
                        ),
                      },
                    ]
                  : []
              }
            />
            <ChangeRows title="Usage" rows={summary.credits} />
            <ChangeRows title="Limits" rows={summary.limits} />
            {summary.lostCapabilities.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Not included in {targetLabel}
                </h3>
                <ul className="flex flex-col gap-1">
                  {summary.lostCapabilities.map((capability) => (
                    <li key={capability}>{capability}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Your chats, projects and files stay. You can keep {currentLabel} any time before the
              switch from Settings, Billing.
            </p>
          </section>
        ) : null}

        {grandfatheredNotice && target ? (
          <p className="text-sm text-muted-foreground">{grandfatheredNotice}</p>
        ) : null}

        {scheduled && target && scheduled.plan !== target.plan ? (
          <p className="text-sm text-muted-foreground">
            This replaces your scheduled switch to {getBillingPlanPricing(scheduled.plan).label}.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive-text">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {state && target ? `Keep ${currentLabel}` : 'Close'}
          </Button>
          {state && target && !state.downgradeBlock ? (
            <Button onClick={() => void confirm()} disabled={submitting} isLoading={submitting}>
              {effectiveOn ? `Switch on ${effectiveOn}` : `Switch to ${targetLabel}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
