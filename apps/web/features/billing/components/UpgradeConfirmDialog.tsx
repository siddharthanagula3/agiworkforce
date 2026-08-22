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
  type UpgradeChargeBreakdown,
} from '../services/stripe-payments';
import {
  getBillingPlanDisplay,
  formatCatalogPrice,
  type SelectablePaidPlan,
} from '../lib/plan-display';
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
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatRenewalDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
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
              setCheckoutRequired({ cents: e.amountDueNowCents, currency: e.currency });
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
  const recurringUsd = unitPriceUsd * (request.seats ?? 1);
  const intervalWord = request.billingInterval === 'yearly' ? 'year' : 'month';

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
              : checkoutRequired
                ? `Your current plan has no paid Stripe charge to credit, so this is not a prorated upgrade. Starting ${planLabel} costs ${formatMoney(checkoutRequired.cents, checkoutRequired.currency)} today. Your existing AGI usage will carry over after checkout completes.`
                : amountDue
                  ? amountDue.charge
                    ? 'Review the charge before it goes to your saved card.'
                    : // No itemized breakdown from the server, so the total has
                      // to carry the explanation on its own.
                      `You'll be charged ${formatMoney(amountDue.cents, amountDue.currency)} today—the prorated difference for the rest of your current billing period. Your renewal date stays the same, at ${formatCatalogPrice(recurringUsd)}/${intervalWord}.`
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
                ? `Renews ${formatRenewalDate(amountDue.charge.renewsAt)}, then ${formatCatalogPrice(recurringUsd)}/${intervalWord} plus tax.`
                : `Renewal date stays the same, at ${formatCatalogPrice(recurringUsd)}/${intervalWord} plus tax.`}
            </p>
          </section>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
