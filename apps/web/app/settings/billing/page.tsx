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

export default function BillingSettingsPage() {
  const subscription = useBillingStore((s) => s.subscription);
  const creditBalance = useBillingStore((s) => s.creditBalance_cents);
  const dailyUsage = useBillingStore((s) => s.dailyUsage_cents);
  const dailyLimit = useBillingStore((s) => s.dailyLimit_cents);

  const tier = subscription?.tier ?? 'free';
  const planPricing = BILLING_PLAN_PRICING[tier as keyof typeof BILLING_PLAN_PRICING];

  const balanceDollars = creditBalance != null ? (creditBalance / 100).toFixed(2) : null;
  const usageDollars = (dailyUsage / 100).toFixed(2);
  const limitDollars = dailyLimit != null ? (dailyLimit / 100).toFixed(2) : null;

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

      {/* Current plan */}
      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Current plan
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Row label="Plan">
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--teal)',
              }}
            >
              {subscription?.display_name ?? 'Free'}
            </span>
          </Row>
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
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 8,
          }}
        >
          <Link
            href="/pricing"
            style={{
              padding: '7px 14px',
              background: 'var(--teal)',
              border: 'none',
              borderRadius: 'var(--radius)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            {tier === 'free' ? 'Upgrade plan' : 'Change plan'}
          </Link>
          {tier !== 'free' && (
            <Link
              href="/billing"
              style={{
                padding: '7px 14px',
                background: 'transparent',
                border: '1px solid var(--border)',
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

      {/* Usage */}
      {balanceDollars !== null && (
        <section
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-elev)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--border)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-2)',
            }}
          >
            Usage
          </div>
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
