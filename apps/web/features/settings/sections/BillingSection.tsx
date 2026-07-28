'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { BILLING_PLAN_PRICING } from '@agiworkforce/types';

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
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="5" stroke={isPaid ? '#fff' : 'var(--text-3)'} strokeWidth="2" />
        <path
          d="M12 2v3M12 19v3M2 12h3M19 12h3"
          stroke={isPaid ? '#fff' : 'var(--text-3)'}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
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

  const tier: string = String(subscription?.tier ?? 'free').toLowerCase();
  const planPricing = BILLING_PLAN_PRICING[tier as keyof typeof BILLING_PLAN_PRICING];

  const isFreeTier = tier === 'free';
  const isManagedPaid = !isFreeTier && subscription?.status === 'active';

  // Real Stripe data (empty for free/unbilled users — the routes return [] when
  // there is no Stripe customer, which we render as an honest empty state).
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Only paid/managed accounts have a Stripe customer; skip the calls for
    // free users to avoid pointless 200-empty round-trips.
    if (!isManagedPaid) {
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
  }, [isManagedPaid]);

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
                {isFreeTier
                  ? 'Free plan'
                  : `${planPricing?.label ?? subscription?.display_name ?? ''} plan`}
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
              {subscription?.current_period_end && (
                <Row label="Renews">
                  <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
                    {formatDate(subscription.current_period_end)}
                  </span>
                </Row>
              )}
              {planPricing && planPricing.monthlyPriceUsd > 0 && (
                <Row label="Price">
                  <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
                    ${planPricing.monthlyPriceUsd}/mo
                  </span>
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
          <Link
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
          </Link>
          {!isFreeTier && (
            <Link
              href="/billing"
              style={{
                padding: '7px 14px',
                background: 'transparent',
                border: '1px solid var(--settings-border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-2)',
                fontSize: 13,
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              Manage billing
            </Link>
          )}
        </div>
      </section>

      {/* Payment section (paid users only) */}
      {isManagedPaid && (
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
            <Link
              href="/billing"
              style={{
                padding: '6px 14px',
                background: 'transparent',
                border: '1px solid var(--settings-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-2)',
                fontSize: 13,
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              {defaultCard ? 'Update' : 'Add payment method'}
            </Link>
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
