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
} from '../services/stripe-payments';
import {
  getBillingPlanDisplay,
  formatCatalogPrice,
  type SelectablePaidPlan,
} from '../lib/plan-display';

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

export function UpgradeConfirmDialog({
  request,
  onCancel,
  onConfirmed,
}: UpgradeConfirmDialogProps) {
  const [amountDue, setAmountDue] = useState<{
    cents: number;
    currency: string;
    previewToken: string;
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
            setError(e instanceof Error ? e.message : 'Could not calculate the upgrade cost.');
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
      setError(e instanceof Error ? e.message : 'Upgrade failed. Your current plan is unchanged.');
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
                  ? `You'll be charged ${formatMoney(amountDue.cents, amountDue.currency)} today—the prorated difference for the rest of your current billing period. Your renewal date stays the same, at ${formatCatalogPrice(recurringUsd)}/${intervalWord}.`
                  : 'Review your upgrade before it is charged to your saved card.'}
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="text-sm text-[color:var(--state-danger,#ef4444)]">{error}</p> : null}

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
