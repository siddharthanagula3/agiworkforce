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
  /** Licensed seats; required for per-seat plans (Team), omitted otherwise. */
  seats?: number;
}

interface UpgradeConfirmDialogProps {
  /** When non-null, the dialog is open and previews this upgrade. */
  request: UpgradeConfirmRequest | null;
  onCancel: () => void;
  /** Called after the upgrade charge succeeds. */
  onConfirmed: () => void;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/**
 * Mid-cycle upgrades charge the customer's already-saved card immediately (there
 * is no Stripe Checkout screen because the card is on file). This dialog closes
 * that UX gap: it fetches the exact prorated amount from `/api/upgrade/preview`
 * and requires an explicit confirmation showing that amount BEFORE
 * `upgradePlanMidCycle` performs the charge.
 */
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
  // Per-seat plans renew at unit price x seats; showing the unit price as the
  // renewal would understate a Team org's bill by the seat count.
  //
  // BIZ-020 made `BillingPlanPricing.monthlyPriceUsd/yearlyPriceUsd` optional so
  // contract-priced Enterprise carries no amount, which means reading them off
  // `display.pricing` no longer type-checks as a number. `SelectablePaidPlan` is
  // `SelfServePaidPlanTier` (basic|pro|max|max_15x|team) and excludes Enterprise,
  // so `getPublishedPlanPriceUsd` — the accessor typed for exactly the tiers that
  // publish a price — supplies a plain number with no null branch to write.
  //
  // No `> 0` guard here either: every (plan, interval) pair this dialog can
  // receive publishes a positive amount. Enumerated over every site that builds
  // an UpgradeConfirmRequest:
  //   - app/pricing/page.tsx:363 (route /pricing) — 'yearly' only for `pro` and
  //     for `team`'s own interval; every other plan is hardcoded 'monthly'.
  //   - features/chat/pages/WebChatPage.tsx:795 (route /chat) — fed by
  //     UpgradePlanDialog, which passes `usesAnnual = annual &&
  //     plan.annualAvailable`, and `annualAvailable` is itself
  //     `yearlyPriceUsd > 0` (features/billing/lib/plan-display.ts:72).
  //   - features/billing/pages/BillingDashboard.tsx:163 — NOT production-routed
  //     today (that module has no importer outside __tests__), and it hardcodes
  //     'monthly' for basic/max/max_15x anyway.
  // The catalog's `yearlyPriceUsd: 0` for basic/max/max_15x means "sells no
  // annual subscription" and cannot arrive here; see the not-yet-closed note on
  // `BillingPlanPricing` in packages/contracts/types/src/billing-catalog.ts.
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
                  ? `You'll be charged ${formatMoney(amountDue.cents, amountDue.currency)} today, prorated for the rest of your billing period. Your plan then renews at ${formatCatalogPrice(recurringUsd)}/${intervalWord}.`
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
