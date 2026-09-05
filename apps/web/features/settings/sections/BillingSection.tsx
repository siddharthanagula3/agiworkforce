'use client';

import { useEffect, useState } from 'react';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { managedUsageComparisonLabel } from '@/lib/billing/managed-usage-caps';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { openBillingPortal, startTopUpCheckout } from '@/features/billing/services/stripe-payments';
import {
  getBillingPlanPricing,
  getPlanPriceUsd,
  isBillingPlanTier,
  isContractPricedPlan,
  isPerSeatBillingPlan,
  isFreeBillingPlanTier,
  isProPlanTier,
  isMaxPlanTier,
  isMax15xPlanTier,
  MAX_TOP_UP_AMOUNT_USD,
  MIN_TOP_UP_AMOUNT_USD,
  TOP_UP_PRESET_AMOUNTS_USD,
  TOP_UP_UNITS_PER_USD,
  topUpUnitsForUsd,
} from '@agiworkforce/types';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { SettingsPageLink } from '../components/SettingsSectionLink';
import { EnterpriseCollectionBanner } from '../components/EnterpriseCollectionBanner';
import { toUserMessage } from '@/lib/user-error-message';

// Real Stripe-backed shapes returned by the web billing routes.
interface PaymentMethod {
  id: string;
  type: string;
  is_default: boolean;
  card?: { brand: string; last4: string; exp_month: number; exp_year: number };
}

interface Invoice {
  id: string;
  number: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

// Real per-task credit ledger rows from apps/web/app/api/billing/credit-history
// (backed by public.credit_transactions, settings-12-gap). `deduction` is
// the per-task debit every managed-cloud request writes; the other four are
// the money-affecting events (top-up, refund, bonus grant, manual
// adjustment). See that route for why `allocation`/`reset` are excluded.
type CreditTransactionType = 'purchase' | 'adjustment' | 'refund' | 'bonus' | 'deduction';

interface CreditHistoryEntry {
  id: string;
  transaction_type: CreditTransactionType | string;
  amount_cents: number;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const CREDIT_TRANSACTION_LABELS: Record<string, string> = {
  purchase: 'Top-up purchase',
  deduction: 'Usage',
  refund: 'Refund',
  bonus: 'Bonus credit',
  adjustment: 'Adjustment',
};

/**
 * `credit_transactions.amount_cents` is stored positive for `deduction` (an
 * "amount spent" magnitude, see db/neon/0020_functions.sql:643-657) but as a
 * signed balance delta for every other type (positive = credited, negative =
 * revoked, see the `refund` caller at db/neon/0020_functions.sql:355). Flip
 * only the verified case so a per-task debit reads as a debit instead of a
 * false "credit added" row; every other type is shown exactly as stored.
 */
function signedCreditCents(entry: CreditHistoryEntry): number {
  return entry.transaction_type === 'deduction'
    ? -Math.abs(entry.amount_cents)
    : entry.amount_cents;
}

function formatSignedMoney(cents: number): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      signDisplay: 'exceptZero',
    }).format(cents / 100);
  } catch {
    const amount = (Math.abs(cents) / 100).toFixed(2);
    return cents < 0 ? `-$${amount}` : `+$${amount}`;
  }
}

type BillingListState<T> =
  | { status: 'idle' | 'loading'; items: T[] }
  | { status: 'ready'; items: T[] }
  | { status: 'error'; items: T[]; message: string };

function formatDate(ts: number | null): string {
  if (!ts) return 'Never';
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatIsoDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ', '
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Who bills this plan, and where it can actually be managed.
 *
 * `subscription_source` is derived server-side in `/api/me` from the
 * subscription row only when its provider identifiers name one unambiguous
 * owner: `stripe`, `apple`, `google`, or `manual`. Contradictory identifiers
 * omit the optional field so clients fail closed. Portal, card, invoice,
 * and top-up controls are rendered only for an explicit `stripe` source;
 * operator-provisioned plans must not imply a Stripe customer exists. Labels
 * mirror Mobile's `subscriptionSource.ts` so both surfaces name the owner the
 * same way.
 */
const BILLING_SOURCE_LABEL: Record<string, string> = {
  stripe: 'AGI Workforce (card on file)',
  apple: 'the Apple App Store',
  google: 'Google Play',
  manual: 'your organization',
};

const STORE_SUBSCRIPTION_URL: Record<string, string> = {
  apple: 'https://apps.apple.com/account/subscriptions',
  google: 'https://play.google.com/store/account/subscriptions',
};

const TERMINAL_BILLING_STATUSES = new Set([
  'none',
  'canceled',
  'cancelled',
  'expired',
  'incomplete_expired',
]);

const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Past due',
  unpaid: 'Unpaid',
  canceled: 'Canceled',
  cancelled: 'Canceled',
  incomplete: 'Incomplete',
  incomplete_expired: 'Incomplete (expired)',
  paused: 'Paused',
  expired: 'Expired',
  none: 'Inactive',
};

function humanizeStatus(status: string): string {
  return (
    SUBSCRIPTION_STATUS_LABEL[status] ??
    status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  );
}

function formatMoney(minorUnits: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(minorUnits / 100);
  } catch {
    return `$${(minorUnits / 100).toFixed(2)}`;
  }
}

function PlanIcon({ tier }: { tier: string }) {
  const isPaid = !isFreeBillingPlanTier(tier);
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: isPaid ? 'var(--chat-accent-primary, #c8892a)' : 'var(--bg-hover)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {/* The brand mark, not a generic crosshair, this is the most prominent
          icon in Billing and it was the only place in the product showing a
          stock glyph where the AGI symbol belongs. */}
      <AgiMark size={26} mono ariaLabel="" style={{ color: isPaid ? '#fff' : 'var(--text-3)' }} />
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--settings-border)',
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--text-2)',
      }}
    >
      {title}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        minHeight: 32,
      }}
    >
      <span style={{ fontSize: 14, color: 'var(--text-3)', flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}

export function BillingSection() {
  const subscription = useBillingStore((s) => s.subscription);
  const billingInitialized = useBillingStore((s) => s.initialized);
  const billingLoading = useBillingStore((s) => s.isLoading);
  const billingError = useBillingStore((s) => s.error);
  const billingUnauthenticated = useBillingStore((s) => s.unauthenticated);
  const refreshUser = useBillingStore((s) => s.refreshUser);

  // "Manage billing" and "Update payment method" are Stripe Customer Portal
  // actions, but both were `<Link href="/billing">`, the old duplicate billing
  // dashboard. Now that `/billing` redirects here, following them would land
  // the user back on the screen they clicked from: two dead controls. They
  // open the portal, which is what their labels have always claimed.
  const [portalPending, setPortalPending] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [topUpAmountUsd, setTopUpAmountUsd] = useState(MIN_TOP_UP_AMOUNT_USD);
  const [topUpPending, setTopUpPending] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [billingDetailsRefresh, setBillingDetailsRefresh] = useState(0);
  const [overageEnabled, setOverageEnabled] = useState(false);
  const [overageAvailableCents, setOverageAvailableCents] = useState(0);
  const [overagePending, setOveragePending] = useState(false);
  const [overageError, setOverageError] = useState<string | null>(null);

  /**
   * Optimistic, then reconciled against the server's answer rather than the
   * value that was requested, the response also carries the spendable balance,
   * and a toggle that claims to be on while the server has it off would be a
   * silent promise to spend money.
   */
  async function setOverage(next: boolean) {
    if (overagePending) return;
    setOveragePending(true);
    setOverageError(null);
    const previous = overageEnabled;
    setOverageEnabled(next);
    try {
      const response = await fetch('/api/billing/overage', {
        method: 'PUT',
        credentials: 'include',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ enabled: next }),
      });
      const body = (await response.json().catch(() => null)) as {
        enabled?: boolean;
        available_cents?: number;
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(body?.error?.message ?? 'Could not update the setting.');
      setOverageEnabled(body?.enabled === true);
      setOverageAvailableCents(Number(body?.available_cents ?? 0));
    } catch (error) {
      setOverageEnabled(previous);
      setOverageError(toUserMessage(error, 'Could not update the setting.'));
    } finally {
      setOveragePending(false);
    }
  }

  async function openPortal(flow?: 'cancel') {
    if (portalPending) return;
    setPortalPending(true);
    setPortalError(null);
    try {
      await openBillingPortal(undefined, flow);
    } catch (error) {
      // openBillingPortal navigates away on success, so reaching here means it
      // failed. Silence would look like a dead button all over again. A cancel
      // deep-link additionally fails when the portal has cancellation switched
      // off, and that message names the route that still works.
      setPortalError(toUserMessage(error, 'Could not open billing portal.'));
      setPortalPending(false);
    }
  }

  const tier: string = String(subscription?.tier ?? 'free').toLowerCase();
  // BIZ-020: `tier` is whatever the subscription row says, so a contract-priced
  // Enterprise account reaches this render. It has no published amount, so the
  // Price row states the contract instead of printing a number.
  // Unknown/legacy tier keys stay undefined so the row falls back to the
  // subscription's own display_name rather than silently reading as "Free".
  const planLabel = isBillingPlanTier(tier) ? getBillingPlanPricing(tier).label : undefined;
  const listPriceUsd = getPlanPriceUsd(tier, 'monthly');
  const planPriceLabel = isContractPricedPlan(tier)
    ? 'Custom, set by your contract'
    : listPriceUsd !== null && listPriceUsd > 0
      ? `$${listPriceUsd}/mo${isPerSeatBillingPlan(tier) ? ' per seat' : ''}`
      : null;

  const isFreeTier = isFreeBillingPlanTier(tier);

  // BIZ-044 (billing diagnostics): name the billing owner instead of assuming
  // Stripe. A store-owned row has no Stripe subscription and no Stripe card, so
  // both the portal button and the card row would be dead controls for it.
  const billingSource = subscription?.subscription_source ?? null;
  const storeManagementUrl = billingSource ? (STORE_SUBSCRIPTION_URL[billingSource] ?? null) : null;
  const isStoreBilled = storeManagementUrl !== null;

  const isManagedPaid = !isFreeTier && ['active', 'trialing'].includes(subscription?.status ?? '');
  const billingStatus = (subscription?.status ?? 'none').trim().toLowerCase();
  const billingOwnerTerminal = TERMINAL_BILLING_STATUSES.has(billingStatus);
  const canAdjustPlan =
    isFreeTier ||
    billingOwnerTerminal ||
    (billingSource === 'stripe' && ['active', 'trialing'].includes(billingStatus));
  const planChangeBlockedCopy =
    billingSource === 'apple'
      ? 'Change or cancel this subscription with Apple before starting web billing.'
      : billingSource === 'google'
        ? 'Change or cancel this subscription with Google Play before starting web billing.'
        : billingSource === 'manual'
          ? 'This plan is managed by your organization. Contact an administrator to change it.'
          : billingSource === 'stripe'
            ? 'Resolve the current billing status in Manage billing before changing plans.'
            : 'Billing ownership is not verified. Refresh your account before changing plans.';
  /**
   * Billing ownership is independent from current entitlement. A past-due,
   * unpaid, or canceled Stripe subscriber still needs their invoices, saved
   * payment method, and Customer Portal to recover or inspect the account.
   */
  const hasStripeBilling = billingInitialized && billingSource === 'stripe';
  const canBuyTopUps = isManagedPaid && billingSource === 'stripe';
  const selectedTopUpUnits = topUpUnitsForUsd(topUpAmountUsd);
  const invalidTopUpLabel =
    topUpAmountUsd < MIN_TOP_UP_AMOUNT_USD
      ? `Minimum $${MIN_TOP_UP_AMOUNT_USD}`
      : topUpAmountUsd > MAX_TOP_UP_AMOUNT_USD
        ? `Maximum $${MAX_TOP_UP_AMOUNT_USD}`
        : 'Whole dollars only';

  async function buyTopUp() {
    if (topUpPending || selectedTopUpUnits === null) return;
    setTopUpPending(true);
    setTopUpError(null);
    try {
      await startTopUpCheckout(topUpAmountUsd);
    } catch (error) {
      setTopUpError(toUserMessage(error, 'Could not start top-up checkout.'));
      setTopUpPending(false);
    }
  }

  // Real Stripe data (empty for free/unbilled users, the routes return [] when
  // there is no Stripe customer, which we render as an honest empty state).
  const [paymentMethods, setPaymentMethods] = useState<BillingListState<PaymentMethod>>({
    status: 'idle',
    items: [],
  });
  const [invoices, setInvoices] = useState<BillingListState<Invoice>>({
    status: 'idle',
    items: [],
  });
  // Credit ledger, unlike payment methods/invoices above, is NOT Stripe-only:
  // every managed-cloud request debits credits regardless of billing source
  // (including the free tier's limited managed chat), so it is fetched in its
  // own effect below rather than gated behind `hasStripeBilling`.
  const [creditHistory, setCreditHistory] = useState<BillingListState<CreditHistoryEntry>>({
    status: 'idle',
    items: [],
  });

  useEffect(() => {
    let cancelled = false;
    // Only paid/managed accounts have a Stripe customer; skip the calls for
    // free users, and for store-billed rows whose card and receipts live with
    // Apple or Google, to avoid pointless 200-empty round-trips.
    if (!billingInitialized || billingLoading) {
      setPaymentMethods({ status: 'idle', items: [] });
      setInvoices({ status: 'idle', items: [] });
      return;
    }
    if (!hasStripeBilling) {
      setPaymentMethods({ status: 'ready', items: [] });
      setInvoices({ status: 'ready', items: [] });
      return;
    }
    setPaymentMethods({ status: 'loading', items: [] });
    setInvoices({ status: 'loading', items: [] });
    // Overage state rides the same gate: it only means anything for a
    // Stripe-billed account, which is the only kind that can buy credits.
    void fetch('/api/billing/overage', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { enabled?: boolean; available_cents?: number } | null) => {
        if (cancelled || !body) return;
        setOverageEnabled(body.enabled === true);
        setOverageAvailableCents(Number(body.available_cents ?? 0));
      })
      .catch(() => {
        // Leaving the toggle in its default (off) state is the honest failure:
        // it never claims an unread setting is on.
      });
    void (async () => {
      const [paymentResult, invoiceResult] = await Promise.allSettled([
        fetch('/api/billing/payment-methods', { credentials: 'include' }).then(async (response) => {
          if (!response.ok)
            throw new Error(`Payment methods could not be loaded (${response.status}).`);
          const json = (await response.json()) as { payment_methods?: PaymentMethod[] };
          return json.payment_methods ?? [];
        }),
        fetch('/api/billing/invoices', { credentials: 'include' }).then(async (response) => {
          if (!response.ok) throw new Error(`Invoices could not be loaded (${response.status}).`);
          const json = (await response.json()) as { invoices?: Invoice[] };
          return json.invoices ?? [];
        }),
      ]);
      if (cancelled) return;
      setPaymentMethods(
        paymentResult.status === 'fulfilled'
          ? { status: 'ready', items: paymentResult.value }
          : {
              status: 'error',
              items: [],
              message:
                paymentResult.reason instanceof Error
                  ? paymentResult.reason.message
                  : 'Payment methods could not be loaded.',
            },
      );
      setInvoices(
        invoiceResult.status === 'fulfilled'
          ? { status: 'ready', items: invoiceResult.value }
          : {
              status: 'error',
              items: [],
              message:
                invoiceResult.reason instanceof Error
                  ? invoiceResult.reason.message
                  : 'Invoices could not be loaded.',
            },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [billingDetailsRefresh, billingInitialized, billingLoading, hasStripeBilling]);

  useEffect(() => {
    let cancelled = false;
    if (!billingInitialized || billingLoading) {
      setCreditHistory({ status: 'idle', items: [] });
      return;
    }
    setCreditHistory({ status: 'loading', items: [] });
    void fetch('/api/billing/credit-history', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Credit history could not be loaded (${response.status}).`);
        const json = (await response.json()) as { transactions?: CreditHistoryEntry[] };
        return json.transactions ?? [];
      })
      .then((items) => {
        if (!cancelled) setCreditHistory({ status: 'ready', items });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCreditHistory({
          status: 'error',
          items: [],
          message: toUserMessage(error, 'Credit history could not be loaded.'),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [billingDetailsRefresh, billingInitialized, billingLoading]);

  const defaultCard =
    paymentMethods.items.find((pm) => pm.is_default)?.card ?? paymentMethods.items[0]?.card;

  function usageBadgeText(): string | null {
    if (isProPlanTier(tier)) return managedUsageComparisonLabel('pro', 'basic', 'Basic');
    if (isMaxPlanTier(tier)) return managedUsageComparisonLabel('max', 'pro', 'Pro');
    if (isMax15xPlanTier(tier)) return managedUsageComparisonLabel('max_15x', 'pro', 'Pro');
    if (isPerSeatBillingPlan(tier)) return managedUsageComparisonLabel('team', 'pro', 'Pro');
    return null;
  }

  const badgeText = usageBadgeText();

  if (!billingInitialized || billingLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <span role="status" aria-live="polite" className="sr-only">
          Loading your billing account…
        </span>
        <div aria-hidden="true" className="flex items-center gap-4">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-foreground/10" />
          <div className="flex flex-col gap-2">
            <div className="h-4 w-40 animate-pulse rounded bg-foreground/10" />
            <div className="h-3 w-56 animate-pulse rounded bg-foreground/[0.07]" />
          </div>
        </div>
        <div
          aria-hidden="true"
          className="h-20 w-full animate-pulse rounded bg-foreground/[0.07]"
        />
        <div
          aria-hidden="true"
          className="h-20 w-full animate-pulse rounded bg-foreground/[0.07]"
        />
      </div>
    );
  }

  // A 401 clears `subscription` without recording an error, so before this
  // guard the render fell straight through to `tier = 'free'` and offered a
  // paying customer an upgrade to the plan they already have, with the usage
  // panel beside it still correctly reading Max 15x from its own request.
  // "We could not read your plan" is the honest thing to say when we could not.
  if (billingUnauthenticated && !subscription) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: 'var(--text-1)' }}>Billing</h1>
        <p
          role="alert"
          style={{ margin: 0, color: 'var(--settings-destructive-text)', fontSize: 14 }}
        >
          Your session expired before we could read your plan. Your subscription has not changed -
          sign in again to see it.
        </p>
        <button
          type="button"
          onClick={() => void refreshUser()}
          style={{ alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 'var(--radius-md)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (billingError && !subscription) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: 'var(--text-1)' }}>Billing</h1>
        <p
          role="alert"
          style={{ margin: 0, color: 'var(--settings-destructive-text)', fontSize: 14 }}
        >
          We couldn&rsquo;t load your billing account. Your plan has not been changed.
        </p>
        <button
          type="button"
          onClick={() => void refreshUser()}
          style={{ alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 'var(--radius-md)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  // Any absent subscription, not just the 401 and error cases above. When
  // /api/me succeeds the store always writes one, and a genuinely free account
  // carries tier 'free' from the server, so null only ever means we did not
  // get an answer. The two guards above each named a specific cause, which left
  // every other cause falling through to `tier = 'free'`: observed 2026-08-17
  // with a Basic account shown "Free plan" and an Upgrade button, beside a
  // Usage panel correctly reading Basic from its own request.
  if (!subscription) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: 'var(--text-1)' }}>Billing</h1>
        <p
          role="alert"
          style={{ margin: 0, color: 'var(--settings-destructive-text)', fontSize: 14 }}
        >
          We couldn&rsquo;t read your plan just now. Your subscription has not changed.
        </p>
        <button
          type="button"
          onClick={() => void refreshUser()}
          style={{ alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 'var(--radius-md)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 4px',
          }}
        >
          Billing
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Your plan, usage, and payment details.
        </p>
      </div>

      <EnterpriseCollectionBanner />

      {/* Current plan: icon, name, one line, Adjust plan at the right */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '14px 0',
            borderBottom: '1px solid var(--settings-border)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <PlanIcon tier={tier} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>
                {/* The catalog label first: `display_name` carries the raw tier
                    key from the subscription row, which rendered as
                    "Max_15x plan" instead of "Max 15x". */}
                {isFreeTier ? 'Free plan' : `${planLabel ?? subscription?.display_name ?? ''} plan`}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>
                {isFreeTier
                  ? 'Try AGI'
                  : (badgeText ?? humanizeStatus(subscription?.status ?? 'none'))}
              </div>
            </div>
          </div>
          {canAdjustPlan ? (
            <SettingsPageLink
              href="/upgrade"
              style={{
                flexShrink: 0,
                padding: '7px 14px',
                background: isFreeTier ? 'var(--text-1)' : 'var(--chat-accent-primary, #c8892a)',
                border: 'none',
                borderRadius: 'var(--radius)',
                color: isFreeTier ? 'var(--bg-base, #09090b)' : 'var(--chat-accent-on-primary)',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              {isFreeTier ? 'Upgrade plan' : 'Adjust plan'}
            </SettingsPageLink>
          ) : (
            <span
              role="status"
              style={{ flexShrink: 0, color: 'var(--text-3)', fontSize: 13, lineHeight: 1.4 }}
            >
              {planChangeBlockedCopy}
            </span>
          )}
        </div>

        {!isFreeTier && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: '14px 0',
              borderBottom: '1px solid var(--settings-border)',
            }}
          >
            <Row label="Status">
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
                {humanizeStatus(subscription?.status ?? 'none')}
              </span>
            </Row>
            {billingSource && billingSource !== 'none' && (
              <Row label="Billed through">
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
                  {BILLING_SOURCE_LABEL[billingSource] ?? billingSource}
                </span>
              </Row>
            )}
            {subscription?.status === 'past_due' || subscription?.status === 'unpaid' ? (
              <div
                role="alert"
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--settings-destructive-text)',
                  color: 'var(--settings-destructive-text)',
                  fontSize: 13,
                }}
              >
                Your last payment did not go through, so this subscription is{' '}
                {subscription.status === 'unpaid' ? 'unpaid' : 'past due'}. Access can be suspended
                until it is settled.{' '}
                <a
                  href="/payment-failure"
                  style={{ color: 'inherit', textDecoration: 'underline' }}
                >
                  What to check and how to fix it
                </a>
              </div>
            ) : null}
            {subscription?.current_period_end && (
              <Row
                label={
                  subscription.cancel_at_period_end
                    ? 'Cancels on'
                    : isManagedPaid
                      ? 'Renews on'
                      : 'Current period ends'
                }
              >
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
                  {formatDate(subscription.current_period_end)}
                </span>
              </Row>
            )}
            {planPriceLabel !== null && (
              <Row label="Price">
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{planPriceLabel}</span>
              </Row>
            )}
          </div>
        )}

        {!isFreeTier && (isStoreBilled || hasStripeBilling) ? (
          <div style={{ padding: '14px 0', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {/* A store-owned subscription cannot be managed in the Stripe portal.
                send the user to the store that actually holds it. */}
            {!isFreeTier && isStoreBilled && (
              <a
                href={storeManagementUrl as string}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '7px 14px',
                  background: 'transparent',
                  border: '1px solid var(--settings-border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-2)',
                  fontSize: 13,
                  textDecoration: 'none',
                }}
              >
                {billingSource === 'apple' ? 'Manage in the App Store' : 'Manage on Google Play'}
              </a>
            )}
            {hasStripeBilling && (
              <button
                type="button"
                onClick={() => void openPortal()}
                disabled={portalPending}
                style={{
                  padding: '7px 14px',
                  background: 'transparent',
                  border: '1px solid var(--settings-border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text-2)',
                  fontSize: 13,
                  cursor: portalPending ? 'progress' : 'pointer',
                }}
              >
                {portalPending ? 'Opening…' : 'Manage billing'}
              </button>
            )}
            {hasStripeBilling && isManagedPaid && (
              <button
                type="button"
                onClick={() => void openPortal('cancel')}
                disabled={portalPending}
                style={{
                  padding: '7px 14px',
                  background: 'transparent',
                  border: '1px solid var(--settings-border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--settings-destructive-text)',
                  fontSize: 13,
                  cursor: portalPending ? 'progress' : 'pointer',
                }}
              >
                Cancel plan
              </button>
            )}
          </div>
        ) : null}
        {portalError && (
          <p
            role="alert"
            style={{
              margin: 0,
              padding: '0 0 14px',
              fontSize: 13,
              color: 'var(--settings-destructive-text)',
            }}
          >
            {portalError}
          </p>
        )}
      </div>

      {/* Payment row (Stripe-billed users only, a store-billed plan's card
          is held by Apple or Google and is not readable or editable here) */}
      {hasStripeBilling && (
        <div>
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
            Payment
          </p>
          {paymentMethods.status === 'loading' || paymentMethods.status === 'idle' ? (
            <div
              aria-hidden="true"
              className="flex items-center gap-3 border-b border-[var(--settings-border)] py-3.5"
            >
              <div className="h-6 w-9 shrink-0 animate-pulse rounded bg-foreground/10" />
              <div className="h-3 w-40 animate-pulse rounded bg-foreground/[0.07]" />
            </div>
          ) : (
            <div
              style={{
                padding: '14px 0',
                borderBottom: '1px solid var(--settings-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 24,
                    borderRadius: 4,
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--settings-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--text-3)',
                    fontFamily: 'var(--mono)',
                    textTransform: 'uppercase',
                  }}
                >
                  {defaultCard ? defaultCard.brand.slice(0, 4) : 'CARD'}
                </div>
                {/* Truthful copy: show the real card when Stripe returns one, an
                    honest error line when the read failed, and a neutral prompt
                    when the account genuinely has none. */}
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  {paymentMethods.status === 'error'
                    ? 'Payment method unavailable'
                    : defaultCard
                      ? `${defaultCard.brand.charAt(0).toUpperCase() + defaultCard.brand.slice(1)} •••• ${defaultCard.last4} · expires ${String(defaultCard.exp_month).padStart(2, '0')}/${defaultCard.exp_year}`
                      : 'No card on file'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void openPortal()}
                disabled={portalPending}
                style={{
                  padding: '6px 14px',
                  background: 'transparent',
                  border: '1px solid var(--settings-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-2)',
                  fontSize: 13,
                  cursor: portalPending ? 'progress' : 'pointer',
                }}
              >
                {portalPending
                  ? 'Opening…'
                  : paymentMethods.status === 'error'
                    ? 'Open billing portal'
                    : defaultCard
                      ? 'Update'
                      : 'Add payment method'}
              </button>
            </div>
          )}
          {paymentMethods.status === 'error' && (
            <p
              role="alert"
              style={{
                margin: 0,
                padding: '8px 0 0',
                color: 'var(--settings-destructive-text)',
                fontSize: 13,
              }}
            >
              {paymentMethods.message}{' '}
              <button type="button" onClick={() => setBillingDetailsRefresh((value) => value + 1)}>
                Try again
              </button>
            </p>
          )}
        </div>
      )}

      {canBuyTopUps && (
        <div id="top-up">
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
            Usage top-up
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                {TOP_UP_UNITS_PER_USD} units for every $1
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-3)' }}>
                Minimum ${MIN_TOP_UP_AMOUNT_USD}; self-serve maximum ${MAX_TOP_UP_AMOUNT_USD}.
                Top-ups add managed-usage balance and do not change your plan or renewal date.
                Unused purchased balance carries across renewals for up to 12 months.
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TOP_UP_PRESET_AMOUNTS_USD.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  aria-pressed={topUpAmountUsd === amount}
                  onClick={() => setTopUpAmountUsd(amount)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${
                      topUpAmountUsd === amount
                        ? 'var(--chat-accent-primary, #c8892a)'
                        : 'var(--settings-border)'
                    }`,
                    background: topUpAmountUsd === amount ? 'rgba(200,137,42,0.12)' : 'transparent',
                    color: 'var(--text-1)',
                    cursor: 'pointer',
                  }}
                >
                  ${amount}
                </button>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Custom amount</span>
                <span style={{ color: 'var(--text-2)' }}>$</span>
                <input
                  aria-label="Custom top-up amount in dollars"
                  type="number"
                  min={MIN_TOP_UP_AMOUNT_USD}
                  max={MAX_TOP_UP_AMOUNT_USD}
                  step={1}
                  value={topUpAmountUsd}
                  onChange={(event) => setTopUpAmountUsd(Number(event.target.value))}
                  style={{
                    width: 92,
                    padding: '7px 9px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--settings-border)',
                    background: 'var(--bg-base)',
                    color: 'var(--text-1)',
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => void buyTopUp()}
                disabled={topUpPending || selectedTopUpUnits === null}
                style={{
                  padding: '8px 14px',
                  border: 0,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--chat-accent-primary, #c8892a)',
                  color: 'var(--chat-accent-on-primary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: topUpPending || selectedTopUpUnits === null ? 'not-allowed' : 'pointer',
                  opacity: topUpPending || selectedTopUpUnits === null ? 0.55 : 1,
                }}
              >
                {topUpPending
                  ? 'Opening checkout…'
                  : selectedTopUpUnits === null
                    ? invalidTopUpLabel
                    : `Buy ${selectedTopUpUnits.toLocaleString('en-US')} units · $${topUpAmountUsd}`}
              </button>
            </div>
            {topUpError && (
              <p
                role="alert"
                style={{ margin: 0, fontSize: 13, color: 'var(--settings-destructive-text)' }}
              >
                {topUpError}
              </p>
            )}

            {/*
              Without this, purchased credit only raised the billing-period
              budget, the rolling 5-hour and weekly caps ignored it entirely,
              so the limit most people actually hit stayed shut no matter how
              much they had bought. Opt-in and off by default: spending a
              balance somebody bought, without asking, is worse than stopping
              at the limit they already expected.
            */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
                paddingTop: 16,
                borderTop: '1px solid var(--settings-border)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                <label
                  htmlFor="overage-toggle"
                  style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}
                >
                  Keep going after a usage limit
                </label>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
                  {overageAvailableCents > 0
                    ? `Spend your credits when a usage limit stops you. ${formatMoney(overageAvailableCents, 'usd')} available.`
                    : 'Spend your credits when a usage limit stops you. Buy credits above to use this.'}
                </p>
                {overageError && (
                  <p
                    role="alert"
                    style={{
                      margin: '6px 0 0',
                      fontSize: 12,
                      color: 'var(--settings-destructive-text)',
                    }}
                  >
                    {overageError}
                  </p>
                )}
              </div>
              <input
                id="overage-toggle"
                type="checkbox"
                role="switch"
                checked={overageEnabled}
                disabled={overagePending}
                onChange={(event) => void setOverage(event.target.checked)}
                style={{
                  width: 18,
                  height: 18,
                  marginTop: 2,
                  accentColor: 'var(--chat-accent-primary, #c8892a)',
                  cursor: overagePending ? 'wait' : 'pointer',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Credit history section (settings-12-gap): the real per-task credit
          ledger from public.credit_transactions, surfaced next to the
          balance/top-up UI above. Never seeded or mocked, an empty table
          means this account has no transactions yet. */}
      <section
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <SectionHeader title="Credit history" />
        {creditHistory.status === 'ready' && creditHistory.items.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--settings-border)',
                    background: 'var(--bg-hover, rgba(255,255,255,0.03))',
                  }}
                >
                  {['Date', 'Description', 'Amount'].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: '10px 16px',
                        textAlign: col === 'Amount' ? 'right' : 'left',
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--text-3)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {creditHistory.items.map((entry, idx) => {
                  const cents = signedCreditCents(entry);
                  return (
                    <tr
                      key={entry.id}
                      style={{
                        borderBottom:
                          idx < creditHistory.items.length - 1
                            ? '1px solid var(--settings-border)'
                            : 'none',
                      }}
                    >
                      <td
                        style={{
                          padding: '12px 16px',
                          color: 'var(--text-1)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatIsoDate(entry.created_at)}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-2)' }}>
                        {entry.description ||
                          CREDIT_TRANSACTION_LABELS[entry.transaction_type] ||
                          entry.transaction_type}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          color: cents < 0 ? 'var(--text-2)' : 'var(--text-1)',
                          fontFamily: 'var(--mono)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatSignedMoney(cents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : creditHistory.status === 'error' ? (
          <div
            role="alert"
            style={{
              padding: '16px 20px',
              color: 'var(--settings-destructive-text)',
              fontSize: 13,
            }}
          >
            {creditHistory.message}{' '}
            <button type="button" onClick={() => setBillingDetailsRefresh((value) => value + 1)}>
              Try again
            </button>
          </div>
        ) : (
          <div style={{ padding: '16px 20px' }}>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
              {creditHistory.status === 'loading' || creditHistory.status === 'idle'
                ? 'Loading credit history…'
                : 'No credit activity yet. Purchases, refunds, bonus grants, adjustments, and per-task usage debits will appear here as they happen.'}
            </p>
          </div>
        )}
      </section>

      {/* Invoices table */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
          Invoices
        </p>
        {invoices.status === 'loading' || invoices.status === 'idle' ? (
          <div aria-hidden="true" className="flex flex-col gap-2 py-1">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-8 w-full animate-pulse rounded bg-foreground/[0.07]" />
            ))}
          </div>
        ) : invoices.status === 'ready' && invoices.items.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--settings-border)',
                    background: 'var(--bg-hover, rgba(255,255,255,0.03))',
                  }}
                >
                  {['Date', 'Total', 'Status', ''].map((col, i) => (
                    <th
                      key={col || `col-${i}`}
                      style={{
                        padding: '10px 16px',
                        textAlign: i === 3 ? 'right' : 'left',
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--text-3)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.items.map((inv, idx) => (
                  <tr
                    key={inv.id}
                    style={{
                      borderBottom:
                        idx < invoices.items.length - 1
                          ? '1px solid var(--settings-border)'
                          : 'none',
                    }}
                  >
                    <td
                      style={{ padding: '12px 16px', color: 'var(--text-1)', whiteSpace: 'nowrap' }}
                    >
                      {formatIsoDate(inv.created_at)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        color: 'var(--text-2)',
                        fontFamily: 'var(--mono)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatMoney(inv.amount, inv.currency)}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        color: 'var(--text-3)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {inv.status}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {inv.hosted_invoice_url ? (
                        <a
                          href={inv.hosted_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 13,
                            color: 'var(--text-2)',
                            textDecoration: 'underline',
                          }}
                        >
                          View
                        </a>
                      ) : (
                        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>, </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : invoices.status === 'error' ? (
          <p
            role="alert"
            style={{ margin: 0, color: 'var(--settings-destructive-text)', fontSize: 13 }}
          >
            {invoices.message}{' '}
            <button type="button" onClick={() => setBillingDetailsRefresh((value) => value + 1)}>
              Try again
            </button>
          </p>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
            {isStoreBilled
              ? `Receipts for this plan are issued by ${BILLING_SOURCE_LABEL[billingSource as string]} and are not available here.`
              : billingSource === 'manual'
                ? 'Invoices for this plan are provided by your organization and are not available here.'
                : isFreeTier
                  ? 'Invoices appear here once you are billed on a paid plan.'
                  : 'No invoices yet. Invoices appear here once your first billing cycle closes.'}
          </p>
        )}
      </div>
    </div>
  );
}
