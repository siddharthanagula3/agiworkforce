'use client';

import { useEffect, useState } from 'react';
import { Switch, useConfirmAction } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { toast } from 'sonner';
import { openBillingPortal } from '@/features/billing/services/stripe-payments';
import {
  fetchPlanChangeState,
  keepCurrentPlan,
  scheduleDowngrade,
} from '@/features/billing/services/billing-account';
import type { PlanChangeState } from '@/features/billing/lib/billing-account-types';
import {
  formatBillingDate,
  formatBillingDateFromSeconds,
  formatBillingMoney,
  formatRecurringMoney,
  formatUsdAmount,
} from '@/features/billing/lib/billing-format';
import {
  formatPlanCreditWindows,
  planUsageComparisonLabel,
} from '@/features/billing/lib/plan-display';
import {
  BillingPlanNotices,
  type OpenInvoiceLink,
} from '@/features/billing/components/BillingPlanNotices';
import { BillingPaymentHistory } from '@/features/billing/components/BillingPaymentHistory';
import { DowngradeReviewDialog } from '@/features/billing/components/DowngradeReviewDialog';
import { TopUpPanel } from '@/features/billing/components/TopUpPanel';
import { AutoReloadPanel } from '@/features/billing/components/AutoReloadPanel';
import {
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  getBillingPlanPricing,
  getPlanPriceUsd,
  isBillingPlanTier,
  isContractPricedPlan,
  isPerSeatBillingPlan,
  isFreeBillingPlanTier,
  isSelfServeIndividualPlanTier,
  creditsFromCents,
  creditsFromMicrousd,
  formatCredits as formatCreditsShared,
} from '@agiworkforce/types';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { SettingsPageLink } from '../components/SettingsSectionLink';
import { EnterpriseCollectionBanner } from '../components/EnterpriseCollectionBanner';
import { toUserMessage } from '@/lib/user-error-message';
import { HelpArticleLink } from '@/features/support/components/HelpArticleLink';

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

type CreditTransactionType = 'purchase' | 'adjustment' | 'refund' | 'bonus' | 'deduction';

interface CreditHistoryEntry {
  id: string;
  transaction_type: CreditTransactionType | string;
  amount_cents: number;
  description: string | null;
  label?: string | null;
  credits?: number;
  feature?: string | null;
  model?: string | null;
  created_at: string;
}

const CREDIT_TRANSACTION_LABELS: Record<string, string> = {
  purchase: 'Top-up purchase',
  deduction: 'Usage',
  refund: 'Refund',
  bonus: 'Bonus credit',
  adjustment: 'Adjustment',
};

function signedCreditCents(entry: CreditHistoryEntry): number {
  return entry.transaction_type === 'deduction'
    ? -Math.abs(entry.amount_cents)
    : entry.amount_cents;
}

const CREDIT_FRACTION_DIGITS = 2;

function formatCredits(cents: number): string {
  return formatCreditsShared(creditsFromCents(Math.abs(cents)), {
    maximumFractionDigits: CREDIT_FRACTION_DIGITS,
  });
}

function formatSignedCredits(cents: number): string {
  if (cents === 0) return formatCredits(cents);
  return `${cents < 0 ? '-' : '+'}${formatCredits(cents)}`;
}

type BillingListState<T> =
  | { status: 'idle' | 'loading'; items: T[] }
  | { status: 'ready'; items: T[] }
  | { status: 'error'; items: T[]; message: string };

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
  trialing: 'Free trial',
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

interface OverageBody {
  enabled?: boolean;
  available_microusd?: number;
  available_cents?: number;
}

function overageAvailableCreditsOf(body: OverageBody): number {
  return typeof body.available_microusd === 'number'
    ? creditsFromMicrousd(body.available_microusd)
    : creditsFromCents(Number(body.available_cents ?? 0));
}

function describeCard(card: NonNullable<PaymentMethod['card']>): string {
  return `${card.brand.charAt(0).toUpperCase()}${card.brand.slice(1)} ending in ${card.last4}`;
}

function PlanIcon({ tier }: { tier: string }) {
  const isPaid = !isFreeBillingPlanTier(tier);
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: isPaid ? 'var(--chat-accent-primary)' : 'var(--bg-hover)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <AgiMark
        size={26}
        mono
        ariaLabel=""
        style={{ color: isPaid ? 'var(--chat-accent-on-primary)' : 'var(--text-3)' }}
      />
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        padding: 'var(--space-4) var(--space-5)',
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
        gap: 'var(--space-4)',
        minHeight: 32,
      }}
    >
      <span style={{ fontSize: 14, color: 'var(--text-3)', flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}

const OUTLINE_BUTTON_STYLE: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-4)',
  background: 'transparent',
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius)',
  color: 'var(--text-2)',
  fontSize: 13,
};

export function BillingSection() {
  const subscription = useBillingStore((s) => s.subscription);
  const billingInitialized = useBillingStore((s) => s.initialized);
  const billingLoading = useBillingStore((s) => s.isLoading);
  const billingError = useBillingStore((s) => s.error);
  const billingUnauthenticated = useBillingStore((s) => s.unauthenticated);
  const refreshUser = useBillingStore((s) => s.refreshUser);

  const [portalPending, setPortalPending] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [billingDetailsRefresh, setBillingDetailsRefresh] = useState(0);
  const [overageEnabled, setOverageEnabled] = useState(false);
  const [overageAvailableCredits, setOverageAvailableCredits] = useState(0);
  const [overagePending, setOveragePending] = useState(false);
  const [overageError, setOverageError] = useState<string | null>(null);
  const [planState, setPlanState] = useState<PlanChangeState | null>(null);
  const [planStateError, setPlanStateError] = useState<string | null>(null);
  const [planActionPending, setPlanActionPending] = useState(false);
  const [planActionError, setPlanActionError] = useState<string | null>(null);
  const [downgradeOpen, setDowngradeOpen] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

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
      const body = (await response.json().catch(() => null)) as
        (OverageBody & { error?: { message?: string } }) | null;
      if (!response.ok) throw new Error(body?.error?.message ?? 'Could not update the setting.');
      setOverageEnabled(body?.enabled === true);
      setOverageAvailableCredits(overageAvailableCreditsOf(body ?? {}));
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
      const opened = await openBillingPortal(undefined, flow, () => void refreshUser());
      if (opened === 'browser') {
        setPortalPending(false);
        toast.info(
          'The billing portal opened in your browser. Your plan updates here when you come back.',
        );
      }
    } catch (error) {
      setPortalError(toUserMessage(error, 'Could not open billing portal.'));
      setPortalPending(false);
    }
  }

  async function resumePlan() {
    if (planActionPending) return;
    setPlanActionPending(true);
    setPlanActionError(null);
    try {
      setPlanState(await keepCurrentPlan());
    } catch (error) {
      setPlanActionError(
        toUserMessage(error, 'Your plan could not be resumed. Nothing was changed.'),
      );
    } finally {
      setPlanActionPending(false);
    }
  }

  function requestSwitchToMonthly() {
    const target = planState?.cadenceSwitch;
    if (!target || planActionPending) return;
    const label = getBillingPlanPricing(target.plan).label;
    const switchOn = formatBillingDate(planState?.periodEnd);
    const monthlyPrice = formatRecurringMoney(
      target.price.amountCents,
      target.price.currency,
      target.price.interval,
    );
    confirm({
      title: `Switch ${label} to monthly billing?`,
      description: `${label} switches to monthly billing ${switchOn ? `on ${switchOn}, ` : ''}when your yearly term ends, and then renews at ${monthlyPrice} plus tax. Nothing is charged today. Once the switch happens, yearly billing is no longer available for ${label}.`,
      confirmLabel: 'Switch to monthly',
      destructive: false,
      onConfirm: async () => {
        setPlanActionPending(true);
        setPlanActionError(null);
        try {
          setPlanState(await scheduleDowngrade(target.plan));
        } catch (error) {
          setPlanActionError(
            toUserMessage(error, 'The switch to monthly billing could not be scheduled.'),
          );
        } finally {
          setPlanActionPending(false);
        }
      },
    });
  }

  const tier: string = String(subscription?.tier ?? 'free').toLowerCase();
  const planLabel = isBillingPlanTier(tier) ? getBillingPlanPricing(tier).label : undefined;
  const displayPlanLabel = planLabel ?? subscription?.display_name ?? '';
  const listPriceUsd = getPlanPriceUsd(tier, 'monthly');
  const yearlyPrice = planState?.price?.interval === 'yearly' ? planState.price : null;
  const planPriceLabel = isContractPricedPlan(tier)
    ? 'Custom, set by your contract'
    : yearlyPrice
      ? formatRecurringMoney(yearlyPrice.amountCents, yearlyPrice.currency, yearlyPrice.interval)
      : listPriceUsd !== null && listPriceUsd > 0
        ? `${formatUsdAmount(listPriceUsd)}/mo${isPerSeatBillingPlan(tier) ? ' per seat' : ''}`
        : null;

  const isFreeTier = isFreeBillingPlanTier(tier);

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
  const hasStripeBilling = billingInitialized && billingSource === 'stripe';
  const canBuyTopUps =
    isManagedPaid &&
    (billingSource === 'stripe' || billingSource === 'apple' || billingSource === 'google');
  const readsPlanState = hasStripeBilling && isManagedPaid;
  const endingSoon = planState
    ? planState.cancelAt !== null
    : subscription?.cancel_at_period_end === true;
  const scheduledChange = planState?.scheduledChange ?? null;
  const canScheduleDowngrade = planState
    ? !planState.downgradeBlock && planState.downgradeTargets.length > 0
    : isSelfServeIndividualPlanTier(tier) &&
      SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER.indexOf(tier) > 0 &&
      !endingSoon;

  const [paymentMethods, setPaymentMethods] = useState<BillingListState<PaymentMethod>>({
    status: 'idle',
    items: [],
  });
  const [invoices, setInvoices] = useState<BillingListState<Invoice>>({
    status: 'idle',
    items: [],
  });
  const [creditHistory, setCreditHistory] = useState<BillingListState<CreditHistoryEntry>>({
    status: 'idle',
    items: [],
  });

  useEffect(() => {
    let cancelled = false;
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
    void fetch('/api/billing/overage', { credentials: 'include' })
      .then((response) => (response.ok ? (response.json() as Promise<OverageBody>) : null))
      .then((body) => {
        if (cancelled || !body) return;
        setOverageEnabled(body.enabled === true);
        setOverageAvailableCredits(overageAvailableCreditsOf(body));
      })
      .catch(() => {
        if (!cancelled) setOverageError('Your overage setting could not be read.');
      });
    void (async () => {
      const [paymentResult, invoiceResult] = await Promise.allSettled([
        fetch('/api/billing/payment-methods', { credentials: 'include' }).then(async (response) => {
          if (!response.ok) {
            throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
          }
          const json = (await response.json()) as { payment_methods?: PaymentMethod[] };
          return json.payment_methods ?? [];
        }),
        fetch('/api/billing/invoices', { credentials: 'include' }).then(async (response) => {
          if (!response.ok) {
            throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
          }
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
              message: toUserMessage(paymentResult.reason, 'Payment methods could not be loaded.'),
            },
      );
      setInvoices(
        invoiceResult.status === 'fulfilled'
          ? { status: 'ready', items: invoiceResult.value }
          : {
              status: 'error',
              items: [],
              message: toUserMessage(invoiceResult.reason, 'Invoices could not be loaded.'),
            },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [billingDetailsRefresh, billingInitialized, billingLoading, hasStripeBilling]);

  useEffect(() => {
    let cancelled = false;
    setPlanStateError(null);
    if (!readsPlanState || billingLoading) {
      setPlanState(null);
      return;
    }
    fetchPlanChangeState()
      .then((state) => {
        if (!cancelled) setPlanState(state);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPlanState(null);
        setPlanStateError(
          toUserMessage(error, 'Your trial, renewal and plan change details could not be loaded.'),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [billingDetailsRefresh, billingLoading, readsPlanState]);

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
  const openInvoice: OpenInvoiceLink | null = (() => {
    const invoice = invoices.items.find(
      (candidate) => candidate.status === 'open' && candidate.hosted_invoice_url,
    );
    return invoice?.hosted_invoice_url
      ? { amountCents: invoice.amount, currency: invoice.currency, url: invoice.hosted_invoice_url }
      : null;
  })();

  const usageComparison = planUsageComparisonLabel(tier);
  const creditWindows = formatPlanCreditWindows(tier);
  const periodEndLabel = formatBillingDateFromSeconds(subscription?.current_period_end ?? null);
  const periodEndRowLabel =
    billingStatus === 'trialing'
      ? 'Trial ends on'
      : endingSoon
        ? 'Ends on'
        : isManagedPaid
          ? 'Renews on'
          : 'Current period ends';

  if (!billingInitialized || billingLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <span role="status" aria-live="polite" className="sr-only">
          Loading your billing account…
        </span>
        <div aria-hidden="true" className="flex items-center gap-4">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-foreground/10" />
          <div className="flex flex-col gap-2">
            <div className="h-4 w-40 animate-pulse rounded-compact bg-foreground/10" />
            <div className="h-3 w-56 animate-pulse rounded-compact bg-foreground/[0.07]" />
          </div>
        </div>
        <div
          aria-hidden="true"
          className="h-20 w-full animate-pulse rounded-compact bg-foreground/[0.07]"
        />
        <div
          aria-hidden="true"
          className="h-20 w-full animate-pulse rounded-compact bg-foreground/[0.07]"
        />
      </div>
    );
  }

  if (billingUnauthenticated && !subscription) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h1 style={{ margin: 0, fontSize: 24, color: 'var(--text-1)' }}>Billing</h1>
        <p
          role="alert"
          style={{ margin: 0, color: 'var(--settings-destructive-text)', fontSize: 14 }}
        >
          Your session expired before we could read your plan. Your subscription has not changed.
          Sign in again to see it.
        </p>
        <button
          type="button"
          onClick={() => void refreshUser()}
          style={{
            alignSelf: 'flex-start',
            padding: 'var(--space-2) var(--space-4)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h1 style={{ margin: 0, fontSize: 24, color: 'var(--text-1)' }}>Billing</h1>
        <p
          role="alert"
          style={{ margin: 0, color: 'var(--settings-destructive-text)', fontSize: 14 }}
        >
          {billingError
            ? 'We couldn’t load your billing account. Your plan has not been changed.'
            : 'We couldn’t read your plan just now. Your subscription has not changed.'}
        </p>
        <button
          type="button"
          onClick={() => void refreshUser()}
          style={{
            alignSelf: 'flex-start',
            padding: 'var(--space-2) var(--space-4)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 var(--space-1)',
          }}
        >
          Billing
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Your plan, credits, and payment details.
        </p>
        <div style={{ marginTop: 'var(--space-2)' }}>
          <HelpArticleLink docId="billing-and-plans" label="How plans and billing work" />
        </div>
      </div>

      <EnterpriseCollectionBanner />

      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            padding: 'var(--space-4) 0',
            borderBottom: '1px solid var(--settings-border)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <PlanIcon tier={tier} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>
                {isFreeTier ? 'Free plan' : `${displayPlanLabel} plan`}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
                {isFreeTier
                  ? 'Try AGI'
                  : (usageComparison ?? humanizeStatus(subscription.status ?? 'none'))}
              </div>
              {creditWindows ? (
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--text-3)',
                    marginTop: 'calc(var(--space-1) / 2)',
                  }}
                >
                  {creditWindows}
                </div>
              ) : null}
            </div>
          </div>
          {canAdjustPlan ? (
            <SettingsPageLink
              href="/upgrade"
              style={{
                flexShrink: 0,
                padding: 'var(--space-2) var(--space-4)',
                background: isFreeTier ? 'var(--text-1)' : 'var(--chat-accent-primary)',
                border: 'none',
                borderRadius: 'var(--radius)',
                color: isFreeTier ? 'var(--bg-base)' : 'var(--chat-accent-on-primary)',
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
              gap: 'var(--space-3)',
              padding: 'var(--space-4) 0',
              borderBottom: '1px solid var(--settings-border)',
            }}
          >
            <Row label="Status">
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
                {humanizeStatus(subscription.status ?? 'none')}
              </span>
            </Row>
            {billingSource && billingSource !== 'none' && (
              <Row label="Billed through">
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
                  {BILLING_SOURCE_LABEL[billingSource] ?? billingSource}
                </span>
              </Row>
            )}
            {periodEndLabel && (
              <Row label={periodEndRowLabel}>
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{periodEndLabel}</span>
              </Row>
            )}
            {planPriceLabel !== null && (
              <Row label="Price">
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{planPriceLabel}</span>
              </Row>
            )}
            <BillingPlanNotices
              planLabel={displayPlanLabel}
              status={billingStatus}
              billingSource={billingSource}
              isEnterprise={isContractPricedPlan(tier)}
              periodEndSeconds={subscription.current_period_end ?? null}
              cancelAtPeriodEnd={subscription.cancel_at_period_end === true}
              planState={planState}
              catalogPriceLabel={planPriceLabel}
              paymentMethodLabel={defaultCard ? describeCard(defaultCard) : null}
              openInvoice={openInvoice}
              actionPending={planActionPending}
              actionError={planActionError}
              portalPending={portalPending}
              onResume={() => void resumePlan()}
              onOpenPortal={() => void openPortal()}
              onSwitchToMonthly={requestSwitchToMonthly}
            />
            {planStateError ? (
              <p
                role="alert"
                style={{ margin: 0, fontSize: 13, color: 'var(--settings-destructive-text)' }}
              >
                {planStateError}{' '}
                <button
                  type="button"
                  onClick={() => setBillingDetailsRefresh((value) => value + 1)}
                >
                  Try again
                </button>
              </p>
            ) : null}
          </div>
        )}

        {!isFreeTier && (isStoreBilled || hasStripeBilling) ? (
          <div
            style={{
              padding: 'var(--space-4) 0',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-2)',
            }}
          >
            {isStoreBilled && (
              <a
                href={storeManagementUrl as string}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...OUTLINE_BUTTON_STYLE, textDecoration: 'none' }}
              >
                {billingSource === 'apple' ? 'Manage in the App Store' : 'Manage on Google Play'}
              </a>
            )}
            {hasStripeBilling && (
              <button
                type="button"
                onClick={() => void openPortal()}
                disabled={portalPending}
                style={{ ...OUTLINE_BUTTON_STYLE, cursor: portalPending ? 'progress' : 'pointer' }}
              >
                {portalPending ? 'Opening…' : 'Manage billing'}
              </button>
            )}
            {hasStripeBilling && canScheduleDowngrade && !scheduledChange && (
              <button
                type="button"
                onClick={() => setDowngradeOpen(true)}
                style={{ ...OUTLINE_BUTTON_STYLE, cursor: 'pointer' }}
              >
                Switch to a smaller plan
              </button>
            )}
            {hasStripeBilling && isManagedPaid && !endingSoon && !scheduledChange && (
              <button
                type="button"
                onClick={() => void openPortal('cancel')}
                disabled={portalPending}
                style={{
                  ...OUTLINE_BUTTON_STYLE,
                  color: 'var(--settings-destructive-text)',
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
              padding: '0 0 var(--space-4)',
              fontSize: 13,
              color: 'var(--settings-destructive-text)',
            }}
          >
            {portalError}
          </p>
        )}
      </div>

      {hasStripeBilling && (
        <div>
          <p
            style={{
              margin: '0 0 var(--space-2)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-2)',
            }}
          >
            Payment
          </p>
          {paymentMethods.status === 'loading' || paymentMethods.status === 'idle' ? (
            <div
              aria-hidden="true"
              className="flex items-center gap-3 border-b border-[var(--settings-border)] py-3.5"
            >
              <div className="h-6 w-9 shrink-0 animate-pulse rounded-compact bg-foreground/10" />
              <div className="h-3 w-40 animate-pulse rounded-compact bg-foreground/[0.07]" />
            </div>
          ) : (
            <div
              style={{
                padding: 'var(--space-4) 0',
                borderBottom: '1px solid var(--settings-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-4)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div
                  style={{
                    width: 36,
                    height: 24,
                    borderRadius: 'var(--corner-compact)',
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
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  {paymentMethods.status === 'error'
                    ? 'Payment method unavailable'
                    : defaultCard
                      ? `${describeCard(defaultCard)} · expires ${String(defaultCard.exp_month).padStart(2, '0')}/${defaultCard.exp_year}`
                      : 'No card on file'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void openPortal()}
                disabled={portalPending}
                style={{
                  ...OUTLINE_BUTTON_STYLE,
                  borderRadius: 'var(--radius-md)',
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
                padding: 'var(--space-2) 0 0',
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

      {canBuyTopUps || isFreeTier ? <TopUpPanel tier={tier} canBuy={canBuyTopUps} /> : null}

      {canBuyTopUps && billingSource === 'stripe' ? (
        <AutoReloadPanel
          onAddPaymentMethod={() => void openPortal()}
          portalPending={portalPending}
        />
      ) : null}

      {canBuyTopUps && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            paddingTop: 'var(--space-4)',
            borderTop: '1px solid var(--settings-border)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0, flex: '1 1 260px' }}>
            <p
              id="overage-toggle-label"
              style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}
            >
              Keep going after a usage limit
            </p>
            <p style={{ margin: 'var(--space-1) 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              {overageAvailableCredits > 0
                ? `Spend your credits when a usage limit stops you. ${formatCreditsShared(overageAvailableCredits, { maximumFractionDigits: CREDIT_FRACTION_DIGITS })} available.`
                : 'Spend your credits when a usage limit stops you. Buy credits above to use this.'}
            </p>
            {overageError && (
              <p
                role="alert"
                style={{
                  margin: 'var(--space-2) 0 0',
                  fontSize: 12,
                  color: 'var(--settings-destructive-text)',
                }}
              >
                {overageError}
              </p>
            )}
          </div>
          <Switch
            aria-labelledby="overage-toggle-label"
            checked={overageEnabled}
            disabled={overagePending}
            onCheckedChange={(next) => void setOverage(next)}
          />
        </div>
      )}

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
                    background: 'var(--bg-hover)',
                  }}
                >
                  {['Date', 'Description', 'Amount'].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
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
                          padding: 'var(--space-3) var(--space-4)',
                          color: 'var(--text-1)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatBillingDate(entry.created_at) ?? ''}
                      </td>
                      <td
                        style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--text-2)' }}
                      >
                        {entry.label ||
                          entry.description ||
                          CREDIT_TRANSACTION_LABELS[entry.transaction_type] ||
                          entry.transaction_type}
                      </td>
                      <td
                        style={{
                          padding: 'var(--space-3) var(--space-4)',
                          textAlign: 'right',
                          color: cents < 0 ? 'var(--text-2)' : 'var(--text-1)',
                          fontFamily: 'var(--mono)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatSignedCredits(cents)}
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
              padding: 'var(--space-4) var(--space-5)',
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
          <div style={{ padding: 'var(--space-4) var(--space-5)' }}>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
              {creditHistory.status === 'loading' || creditHistory.status === 'idle'
                ? 'Loading credit history…'
                : 'No credit activity yet. Purchases, refunds, bonus grants, adjustments, and per-task usage debits will appear here as they happen.'}
            </p>
          </div>
        )}
      </section>

      {hasStripeBilling ? <BillingPaymentHistory refreshKey={billingDetailsRefresh} /> : null}

      <div>
        <p
          style={{
            margin: '0 0 var(--space-2)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Invoices
        </p>
        {invoices.status === 'loading' || invoices.status === 'idle' ? (
          <div aria-hidden="true" className="flex flex-col gap-2 py-1">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="h-8 w-full animate-pulse rounded-compact bg-foreground/[0.07]"
              />
            ))}
          </div>
        ) : invoices.status === 'ready' && invoices.items.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--settings-border)',
                    background: 'var(--bg-hover)',
                  }}
                >
                  {['Date', 'Total', 'Status', ''].map((col, i) => (
                    <th
                      key={col || `col-${i}`}
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
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
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        color: 'var(--text-1)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatBillingDate(inv.created_at) ?? ''}
                    </td>
                    <td
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        color: 'var(--text-2)',
                        fontFamily: 'var(--mono)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatBillingMoney(inv.amount, inv.currency)}
                    </td>
                    <td
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        color: 'var(--text-3)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {inv.status}
                    </td>
                    <td
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                      }}
                    >
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
                          {inv.status === 'open' ? 'Pay' : 'View'}
                        </a>
                      ) : (
                        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Not issued yet</span>
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

      <DowngradeReviewDialog
        open={downgradeOpen}
        onClose={() => setDowngradeOpen(false)}
        onScheduled={(state) => {
          setPlanState(state);
          setDowngradeOpen(false);
        }}
      />
      {confirmDialog}
    </div>
  );
}
