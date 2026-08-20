'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@agiworkforce/ui';
import { useAuthStore } from '@shared/stores/authentication-store';
import { getPublishedPlanPriceUsd } from '@agiworkforce/types';
import {
  CheckoutRequiredError,
  fetchSavedPaymentMethods,
  openBillingPortal,
  previewUpgrade,
  startPlanCheckout,
  upgradePlanMidCycle,
  type SavedPaymentMethod,
  type UpgradeChargeBreakdown,
} from '../services/stripe-payments';
import {
  getBillingPlanDisplay,
  formatCatalogPrice,
  type SelectablePaidPlan,
} from '../lib/plan-display';

export interface UpgradeOrderPanelProps {
  plan: SelectablePaidPlan;
  billingInterval: 'monthly' | 'yearly';
  seats?: number;
  returnPath: string;
  onUpgraded?: () => void;
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

/**
 * Names the method Stripe will charge rather than calling it "your saved card".
 * Link and bank methods carry no card object, so falling back to the type keeps
 * the label truthful instead of inventing a card that is not there.
 */
function describePaymentMethod(method: SavedPaymentMethod): string {
  if (method.card) {
    const brand = method.card.brand.replace(/\b\w/g, (c) => c.toUpperCase());
    return `${brand} ending in ${method.card.last4}`;
  }
  if (method.type === 'link') return 'Link by Stripe';
  return method.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function UpgradeOrderPanel({
  plan,
  billingInterval,
  seats,
  returnPath,
  onUpgraded,
}: UpgradeOrderPanelProps) {
  const [amountDue, setAmountDue] = useState<{
    cents: number;
    currency: string;
    previewToken: string;
    charge: UpgradeChargeBreakdown | null;
  } | null>(null);
  const [previewing, setPreviewing] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [checkoutRequired, setCheckoutRequired] = useState<{
    cents: number;
    currency: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SavedPaymentMethod | null>(null);
  const [paymentMethodsLoaded, setPaymentMethodsLoaded] = useState(false);

  /**
   * Returning from the Stripe portal is a fresh page load, and Clerk has not
   * rehydrated the session on the first render. Firing the preview then makes
   * getAuthToken() return null, and the screen greets the user with
   * "User not authenticated" and an empty order box for an account that is
   * signed in perfectly well.
   */
  const authInitialized = useAuthStore((s) => s.initialized);
  const signedIn = useAuthStore((s) => s.isAuthenticated);

  const display = getBillingPlanDisplay(plan);
  const planLabel = display.pricing.label;
  const unitPriceUsd = getPublishedPlanPriceUsd(plan, billingInterval);
  const recurringUsd = unitPriceUsd * (seats ?? 1);
  const intervalWord = billingInterval === 'yearly' ? 'year' : 'month';

  useEffect(() => {
    if (!authInitialized || !signedIn) return;
    let cancelled = false;
    setPreviewing(true);
    setError(null);
    previewUpgrade({
      plan,
      billingInterval,
      ...(seats === undefined ? {} : { seats }),
    })
      .then((r) => {
        if (cancelled) return;
        setAmountDue({
          cents: r.amountDueNowCents,
          currency: r.currency,
          previewToken: r.previewToken,
          charge: r.charge,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof CheckoutRequiredError) {
          if (e.amountDueNowCents !== null && e.currency) {
            setCheckoutRequired({ cents: e.amountDueNowCents, currency: e.currency });
          } else {
            setError('Could not verify the full checkout price. Please refresh and try again.');
          }
        } else {
          setError(e instanceof Error ? e.message : 'Could not calculate the upgrade cost.');
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plan, billingInterval, seats, authInitialized, signedIn]);

  useEffect(() => {
    if (!authInitialized || !signedIn) return;
    let cancelled = false;
    fetchSavedPaymentMethods()
      .then((methods) => {
        if (cancelled) return;
        setPaymentMethod(methods.find((m) => m.isDefault) ?? methods[0] ?? null);
      })
      .finally(() => {
        if (!cancelled) setPaymentMethodsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authInitialized, signedIn]);

  const changePaymentMethod = useCallback(async () => {
    try {
      await openBillingPortal(returnPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the billing portal.');
    }
  }, [returnPath]);

  async function handleSubscribe() {
    setConfirming(true);
    setError(null);
    try {
      if (checkoutRequired) {
        await startPlanCheckout({
          plan,
          billingInterval,
          ...(seats === undefined ? {} : { seats }),
        });
        return;
      }
      if (!amountDue) throw new Error('Preview the upgrade price before subscribing.');
      await upgradePlanMidCycle({
        plan,
        billingInterval,
        previewToken: amountDue.previewToken,
        ...(seats === undefined ? {} : { seats }),
      });
      onUpgraded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upgrade failed. Your current plan is unchanged.');
      setConfirming(false);
    }
  }

  const charge = amountDue?.charge ?? null;
  const currency = amountDue?.currency ?? 'usd';
  const waitingForSession = !authInitialized;

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="Order details"
        className="rounded-2xl border border-border bg-card p-5 text-sm"
      >
        <h2 className="mb-4 text-base font-semibold">Order details</h2>

        {waitingForSession ? (
          <p className="text-muted-foreground">Loading your account…</p>
        ) : previewing ? (
          <p className="text-muted-foreground">Calculating your prorated cost…</p>
        ) : checkoutRequired ? (
          /*
            Not "Total due today". Starting a plan goes through Stripe Checkout,
            which calculates tax on its own page, so the figure here is the plan
            price and naming it a total would understate what gets charged.
          */
          <div className="flex flex-col gap-2">
            <div className="flex justify-between gap-4 font-semibold">
              <span>{planLabel}</span>
              <span className="tabular-nums">
                {formatMoney(checkoutRequired.cents, checkoutRequired.currency)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Tax is calculated at checkout.</p>
          </div>
        ) : charge ? (
          <dl className="flex flex-col gap-2">
            {charge.lineItems.map((item) => (
              <div key={item.description} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{item.description}</dt>
                <dd className="tabular-nums">{formatMoney(item.amountCents, currency)}</dd>
              </div>
            ))}
            <div className="mt-1 flex justify-between gap-4 border-t border-border pt-2">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(charge.subtotalCents, currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="tabular-nums">{formatMoney(charge.taxCents, currency)}</dd>
            </div>
            {charge.appliedBalanceCents !== 0 ? (
              <>
                <div className="mt-1 flex justify-between gap-4 border-t border-border pt-2">
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="tabular-nums">{formatMoney(charge.totalCents, currency)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Applied balance</dt>
                  <dd className="tabular-nums">
                    {formatMoney(charge.appliedBalanceCents, currency)}
                  </dd>
                </div>
              </>
            ) : null}
            <div className="mt-2 flex justify-between gap-4 border-t border-border pt-3 text-base font-semibold">
              <dt>Total due today</dt>
              <dd className="tabular-nums">{formatMoney(charge.totalDueTodayCents, currency)}</dd>
            </div>
          </dl>
        ) : amountDue ? (
          <div className="flex justify-between gap-4 font-semibold">
            <span>Total due today</span>
            <span className="tabular-nums">{formatMoney(amountDue.cents, currency)}</span>
          </div>
        ) : (
          /*
            Every branch above needs a figure the preview returned, so a failed
            preview fell through to nothing and left a titled card with an empty
            body — which reads as a panel still loading rather than one that
            gave up. The reason is already stated below in the error line; this
            says only that there is no order to show.
          */
          <p className="text-muted-foreground">
            No charge could be calculated for this plan right now.
          </p>
        )}
      </section>

      {!previewing && (charge || amountDue || checkoutRequired) ? (
        <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {charge?.renewsAt
            ? `Your subscription will auto renew on ${formatRenewalDate(charge.renewsAt)}. You will be charged ${formatCatalogPrice(recurringUsd)}/${intervalWord} + tax.`
            : `Your subscription will auto renew at ${formatCatalogPrice(recurringUsd)}/${intervalWord} + tax.`}
        </p>
      ) : null}

      {/*
        Named, not assumed. The previous flow charged whatever Stripe had on file
        without ever showing it, so the only way to find out which card was billed
        was the receipt afterwards.
      */}
      {checkoutRequired ? null : (
        <section
          aria-label="Payment method"
          className="rounded-2xl border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium">Payment method</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {!paymentMethodsLoaded
                  ? 'Loading…'
                  : paymentMethod
                    ? describePaymentMethod(paymentMethod)
                    : 'No payment method on file'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void changePaymentMethod()}>
              {paymentMethodsLoaded && !paymentMethod ? 'Add' : 'Change'}
            </Button>
          </div>
        </section>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/*
        A recurring charge needs assent to the recurrence, not just to the number
        above it. Gating the button on this is what makes the agreement a
        deliberate act rather than a line of small print.
      */}
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        />
        <span>
          You agree that AGI Workforce will charge{' '}
          {checkoutRequired ? 'the payment method you provide at checkout' : 'your payment method'}{' '}
          in the amount above now and on a recurring {intervalWord}ly basis until you cancel in
          accordance with our{' '}
          <Link href="/terms" className="underline underline-offset-2">
            terms
          </Link>
          . You can cancel at any time in your account settings.
        </span>
      </label>

      <Button
        size="lg"
        onClick={() => void handleSubscribe()}
        disabled={
          waitingForSession ||
          previewing ||
          confirming ||
          !agreed ||
          (!amountDue && !checkoutRequired)
        }
      >
        {confirming ? 'Subscribing…' : `Subscribe to ${planLabel}`}
      </Button>
    </div>
  );
}
