'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@agiworkforce/ui';
import { useAuthStore } from '@shared/stores/authentication-store';
import { getPublishedPlanPriceUsd, type SelfServeIndividualPlanTier } from '@agiworkforce/types';
import {
  CheckoutRequiredError,
  fetchSavedPaymentMethods,
  openBillingPortal,
  previewUpgrade,
  startPlanCheckout,
  upgradePlanMidCycle,
  type CheckoutTrialTerms,
  type SavedPaymentMethod,
  type UpgradeChargeBreakdown,
  type UpgradePromotionSummary,
} from '../services/stripe-payments';
import { getBillingPlanDisplay, formatCatalogPrice } from '../lib/plan-display';
import { formatBillingDate, formatBillingMoney } from '../lib/billing-format';
import { toUserMessage } from '@/lib/user-error-message';

export interface UpgradeOrderPanelProps {
  plan: SelfServeIndividualPlanTier;
  returnPath: string;
  onUpgraded?: () => void;
}

function formatMoney(cents: number, currency: string): string {
  return formatBillingMoney(cents, currency);
}

function formatRenewalDate(iso: string): string {
  return formatBillingDate(iso) ?? '';
}

function describePromotion(promotion: UpgradePromotionSummary): string {
  const amount =
    promotion.percentOff !== null
      ? `${promotion.percentOff}% off`
      : promotion.amountOffCents !== null && promotion.currency
        ? `${formatMoney(promotion.amountOffCents, promotion.currency)} off`
        : 'A discount';
  if (promotion.duration === 'forever') return `${amount} every billing period`;
  if (promotion.duration === 'repeating' && promotion.durationInMonths) {
    return `${amount} for ${promotion.durationInMonths} ${promotion.durationInMonths === 1 ? 'month' : 'months'}`;
  }
  return `${amount} this payment`;
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

export function UpgradeOrderPanel({ plan, returnPath, onUpgraded }: UpgradeOrderPanelProps) {
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
    trial: CheckoutTrialTerms | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SavedPaymentMethod | null>(null);
  const [paymentMethodsLoaded, setPaymentMethodsLoaded] = useState(false);
  const [paymentMethodError, setPaymentMethodError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [replacesScheduledChange, setReplacesScheduledChange] = useState(false);
  const [grandfatheredNotice, setGrandfatheredNotice] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<UpgradePromotionSummary | null>(null);
  const [promotionOpen, setPromotionOpen] = useState(false);
  const [promotionInput, setPromotionInput] = useState('');
  const [promotionPending, setPromotionPending] = useState(false);
  const [promotionError, setPromotionError] = useState<string | null>(null);

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
  const recurringUsd = getPublishedPlanPriceUsd(plan);

  useEffect(() => {
    if (!authInitialized || !signedIn) return;
    let cancelled = false;
    setPreviewing(true);
    setError(null);
    setPromotion(null);
    previewUpgrade({ plan, billingInterval: 'monthly' })
      .then((r) => {
        if (cancelled) return;
        setAmountDue({
          cents: r.amountDueNowCents,
          currency: r.currency,
          previewToken: r.previewToken,
          charge: r.charge,
        });
        setReplacesScheduledChange(r.replacesScheduledChange);
        setGrandfatheredNotice(r.grandfatheredNotice);
      })
      .catch((e) => {
        if (cancelled) return;
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
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plan, authInitialized, signedIn, previewKey]);

  useEffect(() => {
    if (!authInitialized || !signedIn) return;
    let cancelled = false;
    setPaymentMethodError(null);
    fetchSavedPaymentMethods()
      .then((methods) => {
        if (cancelled) return;
        setPaymentMethod(methods.find((m) => m.isDefault) ?? methods[0] ?? null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setPaymentMethodError(toUserMessage(e, 'We could not load your payment method.'));
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
      setError(toUserMessage(e, 'Could not open the billing portal.'));
    }
  }, [returnPath]);

  async function applyPromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = promotionInput.trim();
    if (!code || promotionPending) return;
    setPromotionPending(true);
    setPromotionError(null);
    try {
      const result = await previewUpgrade({
        plan,
        billingInterval: 'monthly',
        promotionCode: code,
      });
      setAmountDue({
        cents: result.amountDueNowCents,
        currency: result.currency,
        previewToken: result.previewToken,
        charge: result.charge,
      });
      setReplacesScheduledChange(result.replacesScheduledChange);
      setPromotion(result.promotion);
    } catch (cause) {
      setPromotionError(toUserMessage(cause, 'That promotion code could not be applied.'));
    } finally {
      setPromotionPending(false);
    }
  }

  function removePromotion() {
    setPromotion(null);
    setPromotionInput('');
    setPromotionError(null);
    setPreviewKey((value) => value + 1);
  }

  async function handleSubscribe() {
    setConfirming(true);
    setError(null);
    try {
      if (checkoutRequired) {
        await startPlanCheckout({ plan, billingInterval: 'monthly' });
        return;
      }
      if (!amountDue) throw new Error('Preview the upgrade price before subscribing.');
      await upgradePlanMidCycle({
        plan,
        billingInterval: 'monthly',
        previewToken: amountDue.previewToken,
        ...(promotion ? { promotionCode: promotion.code } : {}),
      });
      onUpgraded?.();
    } catch (e) {
      setError(toUserMessage(e, 'Upgrade failed. Your current plan is unchanged.'));
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
        aria-busy={waitingForSession || previewing}
        aria-live="polite"
        className="rounded-2xl border border-border bg-card p-5 text-sm"
      >
        <h2 className="mb-4 text-base font-semibold">Order details</h2>

        {waitingForSession ? (
          <p className="text-muted-foreground">Loading your account…</p>
        ) : previewing ? (
          <p className="text-muted-foreground">Calculating your prorated cost…</p>
        ) : checkoutRequired?.trial ? (
          <div className="flex flex-col gap-2">
            <dl className="flex flex-col gap-2">
              <div className="flex justify-between gap-4 font-semibold">
                <dt>Due today</dt>
                <dd className="tabular-nums">
                  {formatMoney(checkoutRequired.cents, checkoutRequired.currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  From {formatRenewalDate(checkoutRequired.trial.convertsAt)}
                </dt>
                <dd className="tabular-nums">
                  {`${formatMoney(checkoutRequired.trial.amountCents, checkoutRequired.currency)}/month + tax`}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              {checkoutRequired.trial.days}-day free trial. Checkout asks for a card.
            </p>
          </div>
        ) : checkoutRequired ? (
          /*
            Not "Total due today". Starting a plan goes through Stripe Checkout,
            which calculates tax on its own page, so the figure here is the plan
            price and naming it a total would understate what gets charged.
          */
          <div className="flex flex-col gap-2">
            <dl className="flex justify-between gap-4 font-semibold">
              <dt>{planLabel}</dt>
              <dd className="tabular-nums">
                {formatMoney(checkoutRequired.cents, checkoutRequired.currency)}
              </dd>
            </dl>
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
            {charge.discountCents !== 0 ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">
                  Discount{promotion ? ` (${promotion.code})` : ''}
                </dt>
                <dd className="tabular-nums">{formatMoney(-charge.discountCents, currency)}</dd>
              </div>
            ) : null}
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
            {charge.creditToBalanceCents > 0 ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Credit toward future invoices</dt>
                <dd className="tabular-nums">
                  {formatMoney(charge.creditToBalanceCents, currency)}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : amountDue ? (
          <dl className="flex justify-between gap-4 font-semibold">
            <dt>Total due today</dt>
            <dd className="tabular-nums">{formatMoney(amountDue.cents, currency)}</dd>
          </dl>
        ) : (
          /*
            Every branch above needs a figure the preview returned, so a failed
            preview fell through to nothing and left a titled card with an empty
            body, which reads as a panel still loading rather than one that
            gave up. The reason is already stated below in the error line; this
            says only that there is no order to show.
          */
          <p className="text-muted-foreground">
            No charge could be calculated for this plan right now.
          </p>
        )}
      </section>

      {!previewing && amountDue && !checkoutRequired ? (
        <section aria-label="Promotion code" className="flex flex-col gap-2 text-sm">
          {promotion ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                Promotion {promotion.code}: {describePromotion(promotion)}.
              </span>
              <button
                type="button"
                onClick={removePromotion}
                className="font-medium underline underline-offset-2 pointer-coarse:min-h-11"
              >
                Remove
              </button>
            </p>
          ) : promotionOpen ? (
            <form onSubmit={(event) => void applyPromotion(event)} className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="upgrade-promotion-code">
                Promotion code
              </label>
              <input
                id="upgrade-promotion-code"
                value={promotionInput}
                onChange={(event) => setPromotionInput(event.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="Promotion code"
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 pointer-coarse:h-11"
              />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="pointer-coarse:h-11"
                disabled={!promotionInput.trim() || promotionPending}
                isLoading={promotionPending}
              >
                Apply
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setPromotionOpen(true)}
              className="self-start font-medium underline underline-offset-2 pointer-coarse:min-h-11"
            >
              Add a promotion code
            </button>
          )}
          {promotionError ? (
            <p role="alert" className="text-danger">
              {promotionError}
            </p>
          ) : null}
        </section>
      ) : null}

      {!previewing && replacesScheduledChange ? (
        <p className="text-sm text-muted-foreground">
          Upgrading cancels the plan change you scheduled for your renewal.
        </p>
      ) : null}

      {!previewing && grandfatheredNotice && !checkoutRequired ? (
        <p className="text-sm text-muted-foreground">{grandfatheredNotice}</p>
      ) : null}

      {!previewing && (charge || amountDue || checkoutRequired) ? (
        <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {checkoutRequired?.trial
            ? `Your free trial ends on ${formatRenewalDate(checkoutRequired.trial.convertsAt)}. You will then be charged ${formatMoney(checkoutRequired.trial.amountCents, checkoutRequired.currency)}/month + tax until you cancel. Cancel before ${formatRenewalDate(checkoutRequired.trial.convertsAt)} in Settings > Billing and you won't be charged.`
            : charge?.renewsAt
              ? `Your subscription will auto renew on ${formatRenewalDate(charge.renewsAt)}. You will be charged ${formatCatalogPrice(recurringUsd)}/month + tax.`
              : `Your subscription will auto renew at ${formatCatalogPrice(recurringUsd)}/month + tax.`}
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
              {paymentMethodError ? (
                <p role="alert" className="mt-1 text-sm text-danger">
                  {paymentMethodError}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  {!paymentMethodsLoaded
                    ? 'Loading…'
                    : paymentMethod
                      ? describePaymentMethod(paymentMethod)
                      : 'No payment method on file'}
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => void changePaymentMethod()}>
              {paymentMethodsLoaded && !paymentMethod && !paymentMethodError ? 'Add' : 'Change'}
            </Button>
          </div>
        </section>
      )}

      {error ? (
        <p role="alert" className="text-sm text-danger">
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
          {checkoutRequired?.trial
            ? `${formatMoney(checkoutRequired.trial.amountCents, checkoutRequired.currency)} plus tax on ${formatRenewalDate(checkoutRequired.trial.convertsAt)}, when your free trial ends, and on a recurring monthly basis after that`
            : 'in the amount above now and on a recurring monthly basis'}{' '}
          until you cancel in accordance with our{' '}
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
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
        {confirming
          ? 'Subscribing…'
          : checkoutRequired?.trial
            ? 'Start free trial'
            : `Subscribe to ${planLabel}`}
      </Button>
    </div>
  );
}
