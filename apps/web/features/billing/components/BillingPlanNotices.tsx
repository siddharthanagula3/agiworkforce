'use client';

import type { ReactNode } from 'react';
import { Button } from '@agiworkforce/ui';
import { getBillingPlanPricing } from '@agiworkforce/types';
import type { PlanChangeState } from '../lib/billing-account-types';
import {
  formatBillingDate,
  formatBillingDateFromSeconds,
  formatBillingMoney,
  formatRecurringMoney,
} from '../lib/billing-format';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OpenInvoiceLink {
  amountCents: number;
  currency: string;
  url: string;
}

export interface BillingPlanNoticesProps {
  planLabel: string;
  status: string;
  billingSource: string | null;
  isEnterprise: boolean;
  periodEndSeconds: number | null;
  cancelAtPeriodEnd: boolean;
  planState: PlanChangeState | null;
  catalogPriceLabel: string | null;
  paymentMethodLabel: string | null;
  openInvoice: OpenInvoiceLink | null;
  resumePending: boolean;
  resumeError: string | null;
  portalPending: boolean;
  onResume: () => void;
  onOpenPortal: () => void;
}

function Notice({
  tone,
  children,
  actions,
}: {
  tone: 'neutral' | 'destructive';
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      role={tone === 'destructive' ? 'alert' : undefined}
      className={
        tone === 'destructive'
          ? 'flex flex-col gap-3 rounded-md border border-[var(--settings-destructive-text)] p-3 text-[13px] leading-relaxed text-[color:var(--settings-destructive-text)]'
          : 'flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-3 text-[13px] leading-relaxed'
      }
    >
      <div className="flex flex-col gap-1.5">{children}</div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

function trialLengthDays(state: PlanChangeState | null): number | null {
  if (!state?.trialStart || !state.trialEnd) return null;
  const days = Math.round((Date.parse(state.trialEnd) - Date.parse(state.trialStart)) / DAY_MS);
  return Number.isFinite(days) && days > 0 ? days : null;
}

export function BillingPlanNotices({
  planLabel,
  status,
  billingSource,
  isEnterprise,
  periodEndSeconds,
  cancelAtPeriodEnd,
  planState,
  catalogPriceLabel,
  paymentMethodLabel,
  openInvoice,
  resumePending,
  resumeError,
  portalPending,
  onResume,
  onOpenPortal,
}: BillingPlanNoticesProps) {
  const stripeBilled = billingSource === 'stripe';
  const periodEnd =
    formatBillingDate(planState?.periodEnd) ?? formatBillingDateFromSeconds(periodEndSeconds);
  const endsOn = formatBillingDate(planState?.cancelAt) ?? (cancelAtPeriodEnd ? periodEnd : null);
  const endingSoon = planState ? planState.cancelAt !== null : cancelAtPeriodEnd;
  const renewalPrice = planState?.price
    ? `${formatRecurringMoney(planState.price.amountCents, planState.price.currency, planState.price.interval)} plus tax`
    : catalogPriceLabel;
  const scheduled = planState?.scheduledChange ?? null;
  const notices: ReactNode[] = [];

  const resumeButton = (label: string) => (
    <Button
      key="resume"
      size="sm"
      variant="outline"
      className="pointer-coarse:h-11"
      onClick={onResume}
      disabled={resumePending}
      isLoading={resumePending}
    >
      {label}
    </Button>
  );

  if ((status === 'past_due' || status === 'unpaid') && !isEnterprise) {
    notices.push(
      <Notice
        key="past-due"
        tone="destructive"
        actions={
          stripeBilled ? (
            <>
              {openInvoice ? (
                <a
                  href={openInvoice.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center rounded-md border border-[var(--settings-destructive-text)] px-3 font-medium pointer-coarse:h-11"
                >
                  Pay {formatBillingMoney(openInvoice.amountCents, openInvoice.currency)} now
                </a>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="pointer-coarse:h-11"
                onClick={onOpenPortal}
                disabled={portalPending}
                isLoading={portalPending}
              >
                Update payment method
              </Button>
            </>
          ) : null
        }
      >
        <p className="font-medium">
          Your last {planLabel} payment didn&rsquo;t go through, so the plan is{' '}
          {status === 'unpaid' ? 'unpaid' : 'past due'}.
        </p>
        <p>
          Self-serve plans have no grace period: paid features stop at the first failed renewal and
          come back as soon as the payment succeeds. Your chats and files stay.
        </p>
      </Notice>,
    );
  }

  if (status === 'trialing') {
    const days = trialLengthDays(planState);
    const trialEnd = formatBillingDate(planState?.trialEnd) ?? periodEnd;
    notices.push(
      <Notice
        key="trial"
        tone="neutral"
        actions={
          stripeBilled && endingSoon ? resumeButton(`Continue ${planLabel} after the trial`) : null
        }
      >
        <p className="font-medium">
          {days ? `Your ${days}-day free trial of ${planLabel}` : `Your ${planLabel} trial`}
          {trialEnd ? ` ends on ${trialEnd}.` : ' is active.'}
        </p>
        {!stripeBilled ? null : endingSoon ? (
          <p>
            The trial won&rsquo;t turn into a paid plan. After it ends, your account moves to Free;
            your chats, projects and files stay.
          </p>
        ) : (
          <p>
            After the trial, {planLabel} renews
            {renewalPrice ? ` at ${renewalPrice}` : ''} on{' '}
            {paymentMethodLabel ?? 'your payment method'} unless you cancel before{' '}
            {trialEnd ?? 'it ends'}. Cancel any time from this page.
          </p>
        )}
      </Notice>,
    );
  } else if (endingSoon && endsOn) {
    notices.push(
      <Notice
        key="ending"
        tone="neutral"
        actions={stripeBilled ? resumeButton(`Resume ${planLabel}`) : null}
      >
        <p className="font-medium">
          Your {planLabel} plan ends on {endsOn}.
        </p>
        <p>
          You keep {planLabel} features and credits until then. After that, your account moves to
          Free; your chats, projects and files stay.
        </p>
      </Notice>,
    );
  }

  if (scheduled) {
    const nextLabel = getBillingPlanPricing(scheduled.plan).label;
    const switchOn = formatBillingDate(scheduled.effectiveAt);
    notices.push(
      <Notice key="scheduled" tone="neutral" actions={resumeButton(`Keep ${planLabel}`)}>
        <p className="font-medium">
          Your plan switches to {nextLabel}
          {switchOn ? ` on ${switchOn}` : ''}
          {scheduled.price
            ? `, at ${formatRecurringMoney(scheduled.price.amountCents, scheduled.price.currency, scheduled.price.interval)} plus tax`
            : ''}
          .
        </p>
        <p>You keep {planLabel} and its credits until then.</p>
      </Notice>,
    );
  }

  if (notices.length === 0 && !resumeError) return null;

  return (
    <div className="flex flex-col gap-3">
      {notices}
      {resumeError ? (
        <p role="alert" className="text-[13px] text-destructive-text">
          {resumeError}
        </p>
      ) : null}
    </div>
  );
}
