'use client';

import Link from 'next/link';
import { useBillingStore } from '@/stores/unified/auth';
import { BILLING_PLAN_PRICING } from '@agiworkforce/types';

function formatDate(ts: number | null): string {
  if (!ts) return 'Never';
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const FREE_PLAN_FEATURES = [
  'Chat on web, iOS, Android, and your desktop',
  'Generate code and visualize data',
  'Write, edit, and create content',
  'Analyze text and images',
  'Ability to search the web',
  'Create files and execute code',
  'Connect local models via Ollama or LM Studio',
  'Bring your own API keys (every major provider)',
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
  const creditBalance = useBillingStore((s) => s.creditBalance_cents);
  const dailyUsage = useBillingStore((s) => s.dailyUsage_cents);
  const dailyLimit = useBillingStore((s) => s.dailyLimit_cents);

  const tier = subscription?.tier ?? 'free';
  const planPricing = BILLING_PLAN_PRICING[tier as keyof typeof BILLING_PLAN_PRICING];

  const balanceDollars = creditBalance != null ? (creditBalance / 100).toFixed(2) : null;
  const usageDollars = (dailyUsage / 100).toFixed(2);
  const limitDollars = dailyLimit != null ? (dailyLimit / 100).toFixed(2) : null;

  const isFreeTier = tier === 'free';
  const isManagedPaid = !isFreeTier && subscription?.status === 'active';

  function usageBadgeText(): string | null {
    // Tiers are Local/Free, Pro, Max (the 'hobby' tier was removed). The Pro badge compared
    // against the now-nonexistent 'Hobby' tier — compare against Free instead.
    if (tier === 'max') return '20x more usage than Pro';
    if (tier === 'pro') return '5x more usage than Free';
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
                {isFreeTier ? 'Free plan' : `${subscription?.display_name ?? ''} plan`}
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
                }}
              >
                CARD
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Managed by Stripe</span>
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
              Update
            </Link>
          </div>
        </section>
      )}

      {/* Usage section */}
      {balanceDollars !== null && (
        <section
          style={{
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-elev)',
            overflow: 'hidden',
          }}
        >
          <SectionHeader title="Usage" />
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Row label="Credit balance">
              <span style={{ fontSize: 14, fontFamily: 'var(--mono)', color: 'var(--text-2)' }}>
                ${balanceDollars}
              </span>
            </Row>
            <Row label="Today's usage">
              <span style={{ fontSize: 14, fontFamily: 'var(--mono)', color: 'var(--text-2)' }}>
                ${usageDollars}
                {limitDollars !== null && (
                  <span style={{ color: 'var(--text-3)' }}> / ${limitDollars}</span>
                )}
              </span>
            </Row>
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
        <div
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
            {isFreeTier
              ? 'No invoices yet. Upgrade to a paid plan to see your billing history.'
              : 'View and download your full invoice history on the billing dashboard.'}
          </p>
          {!isFreeTier && (
            <Link
              href="/billing"
              style={{
                flexShrink: 0,
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
              View invoices
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
