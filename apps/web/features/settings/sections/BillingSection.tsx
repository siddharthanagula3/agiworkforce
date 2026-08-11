'use client';

import { useEffect, useState } from 'react';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { openBillingPortal, startTopUpCheckout } from '@/features/billing/services/stripe-payments';
import {
  getBillingPlanPricing,
  getPlanPriceUsd,
  isBillingPlanTier,
  isContractPricedPlan,
  isPerSeatBillingPlan,
  MAX_TOP_UP_AMOUNT_USD,
  MIN_TOP_UP_AMOUNT_USD,
  TOP_UP_PRESET_AMOUNTS_USD,
  TOP_UP_UNITS_PER_USD,
  topUpUnitsForUsd,
} from '@agiworkforce/types';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { SettingsPageLink } from '../components/SettingsSectionLink';

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
    ? '—'
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Who bills this plan, and where it can actually be managed.
 *
 * `subscription_source` is derived server-side in `/api/me` from the
 * subscription row: `stripe` when there is a `stripe_subscription_id`, then
 * `apple`/`google` for the store transaction columns (migration 0046), and
 * `manual` for a row provisioned without any of them. Because `stripe` is
 * checked first, an `apple`/`google` row provably has NO Stripe subscription
 * and no Stripe-held card, so only those two lose the portal button here — a
 * `manual` row keeps it, since such an account can still own a Stripe customer
 * carrying earlier invoices. Labels mirror Mobile's `subscriptionSource.ts` so
 * both surfaces name the owner the same way.
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

const FREE_PLAN_FEATURES = [
  'Chat on web, iOS, Android, and your desktop',
  'Generate code and visualize data',
  'Write, edit, and create content',
  'Analyze text and images',
  'Ability to search the web',
  'Create files and execute code',
  'Connect local models via Ollama or LM Studio',
  'Bring your own supported API keys',
];

function PlanIcon({ tier }: { tier: string }) {
  const isPaid = tier !== 'free';
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
      {/* The brand mark, not a generic crosshair — this is the most prominent
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

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ flexShrink: 0, marginTop: 1 }}
    >
      <path
        d="M3 8l3.5 3.5L13 5"
        stroke="var(--chat-accent-primary, #c8892a)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

  // "Manage billing" and "Update payment method" are Stripe Customer Portal
  // actions, but both were `<Link href="/billing">` — the old duplicate billing
  // dashboard. Now that `/billing` redirects here, following them would land
  // the user back on the screen they clicked from: two dead controls. They
  // open the portal, which is what their labels have always claimed.
  const [portalPending, setPortalPending] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [topUpAmountUsd, setTopUpAmountUsd] = useState(MIN_TOP_UP_AMOUNT_USD);
  const [topUpPending, setTopUpPending] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);

  async function openPortal() {
    if (portalPending) return;
    setPortalPending(true);
    setPortalError(null);
    try {
      await openBillingPortal();
    } catch (error) {
      // openBillingPortal navigates away on success, so reaching here means it
      // failed. Silence would look like a dead button all over again.
      setPortalError(error instanceof Error ? error.message : 'Could not open billing portal.');
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
    ? 'Custom — set by your contract'
    : listPriceUsd !== null && listPriceUsd > 0
      ? `$${listPriceUsd}/mo${isPerSeatBillingPlan(tier) ? ' per seat' : ''}`
      : null;

  const isFreeTier = tier === 'free';

  // BIZ-044 (billing diagnostics): name the billing owner instead of assuming
  // Stripe. A store-owned row has no Stripe subscription and no Stripe card, so
  // both the portal button and the card row would be dead controls for it.
  const billingSource = subscription?.subscription_source ?? null;
  const storeManagementUrl = billingSource ? (STORE_SUBSCRIPTION_URL[billingSource] ?? null) : null;
  const isStoreBilled = storeManagementUrl !== null;

  const isManagedPaid = !isFreeTier && subscription?.status === 'active';
  /** Only a Stripe-billed account has a Stripe customer to read cards/invoices from. */
  const hasStripeBilling = isManagedPaid && !isStoreBilled;
  const canBuyTopUps = hasStripeBilling && billingSource === 'stripe';
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
      setTopUpError(error instanceof Error ? error.message : 'Could not start top-up checkout.');
      setTopUpPending(false);
    }
  }

  // Real Stripe data (empty for free/unbilled users — the routes return [] when
  // there is no Stripe customer, which we render as an honest empty state).
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Only paid/managed accounts have a Stripe customer; skip the calls for
    // free users, and for store-billed rows whose card and receipts live with
    // Apple or Google, to avoid pointless 200-empty round-trips.
    if (!hasStripeBilling) {
      setPaymentMethods([]);
      setInvoices([]);
      return;
    }
    void (async () => {
      try {
        const [pmRes, invRes] = await Promise.all([
          fetch('/api/billing/payment-methods', { credentials: 'include' }),
          fetch('/api/billing/invoices', { credentials: 'include' }),
        ]);
        if (!cancelled && pmRes.ok) {
          const json = (await pmRes.json()) as { payment_methods?: PaymentMethod[] };
          setPaymentMethods(json.payment_methods ?? []);
        } else if (!cancelled) {
          setPaymentMethods([]);
        }
        if (!cancelled && invRes.ok) {
          const json = (await invRes.json()) as { invoices?: Invoice[] };
          setInvoices(json.invoices ?? []);
        } else if (!cancelled) {
          setInvoices([]);
        }
      } catch {
        if (!cancelled) {
          setPaymentMethods([]);
          setInvoices([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasStripeBilling]);

  const defaultCard =
    paymentMethods?.find((pm) => pm.is_default)?.card ?? paymentMethods?.[0]?.card;

  function usageBadgeText(): string | null {
    if (tier === 'pro') return '5x more usage than Basic';
    if (tier === 'max') return '5x more usage than Pro';
    if (tier === 'max_15x') return '15x more usage than Pro';
    if (tier === 'team') return 'Same usage as Pro';
    return null;
  }

  const badgeText = usageBadgeText();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--serif)',
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

      {/* Current plan card */}
      <section
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <SectionHeader title="Current plan" />

        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <PlanIcon tier={tier} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-1)' }}>
                {/* The catalog label first: `display_name` carries the raw tier
                    key from the subscription row, which rendered as
                    "Max_15x plan" instead of "Max 15x". */}
                {isFreeTier ? 'Free plan' : `${planLabel ?? subscription?.display_name ?? ''} plan`}
              </div>
              {isFreeTier && (
                <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>Try AGI</div>
              )}
            </div>
            {badgeText && (
              <span
                style={{
                  marginLeft: 'auto',
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--chat-accent-primary, #c8892a)',
                  background: 'rgba(200,137,42,0.12)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(200,137,42,0.25)',
                  whiteSpace: 'nowrap',
                }}
              >
                {badgeText}
              </span>
            )}
          </div>

          {isFreeTier && (
            <ul
              style={{
                listStyle: 'none',
                margin: '0 0 16px',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {FREE_PLAN_FEATURES.map((feat) => (
                <li
                  key={feat}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    fontSize: 13,
                    color: 'var(--text-2)',
                  }}
                >
                  <CheckIcon />
                  {feat}
                </li>
              ))}
            </ul>
          )}

          {!isFreeTier && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <Row label="Status">
                <span style={{ fontSize: 14, color: 'var(--text-2)', textTransform: 'capitalize' }}>
                  {subscription?.status ?? 'inactive'}
                </span>
              </Row>
              {billingSource && billingSource !== 'none' && (
                <Row label="Billed through">
                  <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
                    {BILLING_SOURCE_LABEL[billingSource] ?? billingSource}
                  </span>
                </Row>
              )}
              {subscription?.current_period_end && (
                <Row label="Renews">
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
        </div>

        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--settings-border)',
            display: 'flex',
            gap: 8,
          }}
        >
          <SettingsPageLink
            href="/pricing"
            style={{
              padding: '7px 14px',
              background: isFreeTier ? 'var(--text-1)' : 'var(--chat-accent-primary, #c8892a)',
              border: 'none',
              borderRadius: 'var(--radius)',
              color: isFreeTier ? 'var(--bg-base, #09090b)' : '#fff',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            {isFreeTier ? 'Upgrade plan' : 'Adjust plan'}
          </SettingsPageLink>
          {/* A store-owned subscription cannot be managed in the Stripe portal —
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
          {!isFreeTier && !isStoreBilled && (
            <button
              type="button"
              onClick={openPortal}
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
        </div>
        {portalError && (
          <div
            role="alert"
            style={{
              padding: '0 20px 16px',
              fontSize: 13,
              color: 'var(--danger, #b3261e)',
            }}
          >
            {portalError}
          </div>
        )}
      </section>

      {/* Payment section (Stripe-billed users only — a store-billed plan's card
          is held by Apple or Google and is not readable or editable here) */}
      {hasStripeBilling && (
        <section
          style={{
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-elev)',
            overflow: 'hidden',
          }}
        >
          <SectionHeader title="Payment" />
          <div
            style={{
              padding: '16px 20px',
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
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--text-3)',
                  fontFamily: 'var(--mono)',
                  textTransform: 'uppercase',
                }}
              >
                {defaultCard ? defaultCard.brand.slice(0, 4) : 'CARD'}
              </div>
              {/* Truthful copy: show the real card when Stripe returns one, an
                  honest "no method on file" line while loading is null, and a
                  neutral prompt when the account genuinely has none. */}
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {paymentMethods === null
                  ? 'Loading payment method…'
                  : defaultCard
                    ? `${defaultCard.brand.charAt(0).toUpperCase() + defaultCard.brand.slice(1)} •••• ${defaultCard.last4} · expires ${String(defaultCard.exp_month).padStart(2, '0')}/${defaultCard.exp_year}`
                    : 'No card on file'}
              </span>
            </div>
            <button
              type="button"
              onClick={openPortal}
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
              {portalPending ? 'Opening…' : defaultCard ? 'Update' : 'Add payment method'}
            </button>
          </div>
        </section>
      )}

      {canBuyTopUps && (
        <section
          id="top-up"
          style={{
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-elev)',
            overflow: 'hidden',
          }}
        >
          <SectionHeader title="Usage top-up" />
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                  color: '#fff',
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
              <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--danger, #b3261e)' }}>
                {topUpError}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Invoices section */}
      <section
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <SectionHeader title="Invoices" />
        {invoices && invoices.length > 0 ? (
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
                        fontSize: 11,
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
                {invoices.map((inv, idx) => (
                  <tr
                    key={inv.id}
                    style={{
                      borderBottom:
                        idx < invoices.length - 1 ? '1px solid var(--settings-border)' : 'none',
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
                        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '16px 20px' }}>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
              {invoices === null
                ? 'Loading invoices…'
                : isStoreBilled
                  ? `Receipts for this plan are issued by ${BILLING_SOURCE_LABEL[billingSource as string]} and are not available here.`
                  : isFreeTier
                    ? 'Invoices appear here once you are billed on a paid plan.'
                    : 'No invoices yet. Invoices appear here once your first billing cycle closes.'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
