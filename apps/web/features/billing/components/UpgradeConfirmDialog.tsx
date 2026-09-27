'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
} from '@agiworkforce/ui';
import { getPublishedPlanPriceUsd } from '@agiworkforce/types';
import {
  CheckoutRequiredError,
  previewUpgrade,
  startPlanCheckout,
  upgradePlanMidCycle,
  type CheckoutTrialTerms,
  type UpgradeChargeBreakdown,
} from '../services/stripe-payments';
import {
  getBillingPlanDisplay,
  formatCatalogPrice,
  type SelectablePaidPlan,
} from '../lib/plan-display';
import { formatBillingDate, formatBillingMoney } from '../lib/billing-format';
import { toUserMessage } from '@/lib/user-error-message';

export interface UpgradeConfirmRequest {
  plan: SelectablePaidPlan;
  billingInterval: 'monthly' | 'yearly';
  seats?: number;
}

interface UpgradeConfirmDialogProps {
  request: UpgradeConfirmRequest | null;
  onCancel: () => void;
  onConfirmed: () => void;
}

function formatMoney(cents: number, currency: string): string {
  return formatBillingMoney(cents, currency);
}

function formatRenewalDate(iso: string): string {
  return formatBillingDate(iso) ?? '';
}

function describeTrial(input: {
  planLabel: string;
  trial: CheckoutTrialTerms;
  dueTodayCents: number;
  currency: string;
  intervalWord: string;
}): string {
  const { planLabel, trial, currency } = input;
  const convertsOn = formatRenewalDate(trial.convertsAt);
  return (
    `${planLabel} is free for ${trial.days} days, so you pay ` +
    `${formatMoney(input.dueTodayCents, currency)} today. ` +
    `Checkout asks for a card, and on ${convertsOn} it is charged ` +
    `${formatMoney(trial.amountCents, currency)} plus tax, then every ${input.intervalWord} ` +
    `until you cancel. Cancel before ${convertsOn} in Settings > Billing and you won't be charged.`
  );
}

export function UpgradeConfirmDialog({
  request,
  onCancel,
  onConfirmed,
}: UpgradeConfirmDialogProps) {
  const [amountDue, setAmountDue] = useState<{
    cents: number;
    currency: string;
    previewToken: string;
    charge: UpgradeChargeBreakdown | null;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [checkoutRequired, setCheckoutRequired] = useState<{
    cents: number;
    currency: string;
    trial: CheckoutTrialTerms | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) {
      setAmountDue(null);
      setError(null);
      setConfirming(false);
      setCheckoutRequired(null);
      return;
    }
    let cancelled = false;
    setPreviewing(true);
    setError(null);
    setAmountDue(null);
    setCheckoutRequired(null);
    previewUpgrade({
      plan: request.plan,
      billingInterval: request.billingInterval,
      ...(request.seats === undefined ? {} : { seats: request.seats }),
    })
      .then((r) => {
        if (!cancelled) {
          setAmountDue({
            cents: r.amountDueNowCents,
            currency: r.currency,
            previewToken: r.previewToken,
            charge: r.charge,
          });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          if (e instanceof CheckoutRequiredError) {
            if (e.amountDueNowCents !== null && e.currency) {
              setCheckoutRequired({
                cents: e.amountDueNowCents,
                currency: e.currency,
                trial: e.trial ?? null,
              });
            } else {
              setError('Could not verify the full checkout price. Please refresh and try again.');
            }
          } else {
            setError(toUserMessage(e, 'Could not calculate the upgrade cost.'));
          }
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  if (!request) return null;

  const display = getBillingPlanDisplay(request.plan);
  const planLabel = display.pricing.label;
  const unitPriceUsd = getPublishedPlanPriceUsd(request.plan, request.billingInterval);
  const intervalWord = request.billingInterval === 'yearly' ? 'year' : 'month';
  const recurringPrice =
    unitPriceUsd === null
      ? `the ${request.billingInterval} ${planLabel} price`
      : `${formatCatalogPrice(unitPriceUsd * (request.seats ?? 1))}/${intervalWord}`;

  async function handleConfirm() {
    if (!request) return;
    setConfirming(true);
    setError(null);
    try {
      if (checkoutRequired) {
        await startPlanCheckout({
          plan: request.plan,
          billingInterval: request.billingInterval,
          ...(request.seats === undefined ? {} : { seats: request.seats }),
        });
        return;
      }
      if (!amountDue) throw new Error('Preview the upgrade price before confirming.');
      await upgradePlanMidCycle({
        plan: request.plan,
        billingInterval: request.billingInterval,
        previewToken: amountDue.previewToken,
        ...(request.seats === undefined ? {} : { seats: request.seats }),
      });
      onConfirmed();
    } catch (e) {
      setError(toUserMessage(e, 'Upgrade failed. Your current plan is unchanged.'));
      setConfirming(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !confirming) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upgrade to {planLabel}</DialogTitle>
          <DialogDescription>
            {previewing
              ? 'Calculating your prorated cost…'
              : checkoutRequired?.trial
                ? describeTrial({
                    planLabel,
                    trial: checkoutRequired.trial,
                    dueTodayCents: checkoutRequired.cents,
                    currency: checkoutRequired.currency,
                    intervalWord,
                  })
                : checkoutRequired
                  ? `Your current plan has no paid Stripe charge to credit, so this is not a prorated upgrade. Starting ${planLabel} costs ${formatMoney(checkoutRequired.cents, checkoutRequired.currency)} today. Your existing AGI usage will carry over after checkout completes.`
                  : amountDue
                    ? amountDue.charge
                      ? 'Review the charge before it goes to your saved card.'
                      : `You'll be charged ${formatMoney(amountDue.cents, amountDue.currency)} today. After that, ${planLabel} renews at ${recurringPrice} plus tax.`
                    : 'Review your upgrade before it is charged to your saved card.'}
          </DialogDescription>
        </DialogHeader>

        {/*
          An itemized receipt rather than one number in a sentence. Every row is
          a real Stripe proration line, so what is listed here is what the
          invoice will hold: the new plan for the period being started, minus a
          credit for unused time on the old one, then tax.
        */}
        {amountDue?.charge ? (
          <section
            aria-label="Order details"
            className="rounded-lg border border-border p-4 text-sm"
          >
            <h3 className="mb-3 font-medium">Order details</h3>
            <dl className="flex flex-col gap-2">
              {amountDue.charge.lineItems.map((item) => (
                <div key={item.description} className="flex justify-between gap-4">
                  <dt className="text-[color:var(--text-2)]">{item.description}</dt>
                  <dd className="tabular-nums">
                    {formatMoney(item.amountCents, amountDue.currency)}
                  </dd>
                </div>
              ))}
              <div className="mt-1 flex justify-between gap-4 border-t pt-2">
                <dt className="text-[color:var(--text-2)]">Subtotal</dt>
                <dd className="tabular-nums">
                  {formatMoney(amountDue.charge.subtotalCents, amountDue.currency)}
                </dd>
              </div>
              {amountDue.charge.discountCents !== 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-[color:var(--text-2)]">Discount</dt>
                  <dd className="tabular-nums">
                    {formatMoney(-amountDue.charge.discountCents, amountDue.currency)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-[color:var(--text-2)]">Tax</dt>
                <dd className="tabular-nums">
                  {formatMoney(amountDue.charge.taxCents, amountDue.currency)}
                </dd>
              </div>
              {/*
                Total and Total due today are different numbers whenever the
                account carries a Stripe balance, so both are shown rather than
                collapsing them and leaving the difference unexplained.
              */}
              {amountDue.charge.appliedBalanceCents !== 0 ? (
                <>
                  <div className="mt-1 flex justify-between gap-4 border-t pt-2">
                    <dt className="text-[color:var(--text-2)]">Total</dt>
                    <dd className="tabular-nums">
                      {formatMoney(amountDue.charge.totalCents, amountDue.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[color:var(--text-2)]">Applied balance</dt>
                    <dd className="tabular-nums">
                      {formatMoney(amountDue.charge.appliedBalanceCents, amountDue.currency)}
                    </dd>
                  </div>
                </>
              ) : null}
              <div className="mt-1 flex justify-between gap-4 border-t pt-2 font-semibold">
                <dt>Total due today</dt>
                <dd className="tabular-nums">
                  {formatMoney(amountDue.charge.totalDueTodayCents, amountDue.currency)}
                </dd>
              </div>
            </dl>
            {/*
              Always stated, date or not. What recurs afterwards is the part a
              user is most likely to be surprised by later, so it must not be
              conditional on Stripe having returned a period end.
            */}
            <p className="mt-3 text-xs text-[color:var(--text-3)]">
              {amountDue.charge.renewsAt
                ? `Renews ${formatRenewalDate(amountDue.charge.renewsAt)}, then ${recurringPrice} plus tax.`
                : `Then ${recurringPrice} plus tax at each renewal.`}
            </p>
          </section>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={confirming}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={previewing || confirming || (!amountDue && !checkoutRequired)}
          >
            {confirming
              ? 'Upgrading…'
              : checkoutRequired?.trial
                ? 'Start free trial'
                : checkoutRequired
                  ? `Start ${planLabel} · pay ${formatMoney(checkoutRequired.cents, checkoutRequired.currency)}`
                  : amountDue
                    ? `Confirm · pay ${formatMoney(amountDue.cents, amountDue.currency)}`
                    : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
