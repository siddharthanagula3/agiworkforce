'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Progress } from '@agiworkforce/ui';
import {
  getBillingPlanPricing,
  normalizeUsagePercentage,
  type ManagedUsageSummaryResponse,
} from '@agiworkforce/types';
import { useBillingStore } from '@shared/stores/web-auth-store';

type UsageResponse = ManagedUsageSummaryResponse;

function formatReset(value: string | null, kind: 'rolling' | 'period'): string {
  if (!value) return kind === 'rolling' ? 'No usage in this window' : 'No reset scheduled';
  const formatted = new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return kind === 'rolling' ? `Next capacity refreshes ${formatted}` : `Resets ${formatted}`;
}

function UsageBar({
  label,
  percent,
  value,
  detail,
}: {
  label: string;
  percent: number;
  value: string;
  detail: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{value}</span>
      </div>
      <Progress
        value={percent}
        aria-label={`${label} usage`}
        className="h-2"
        indicatorClassName="bg-[var(--chat-accent-primary)]"
        style={{ background: 'var(--bg-hover, rgba(255,255,255,0.08))' }}
      />
      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{detail}</span>
    </div>
  );
}

export function UsageSection() {
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('Not loaded');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const usageRes = await fetch('/api/usage', { credentials: 'include' });

      if (!usageRes.ok) throw new Error('Could not load usage');

      setUsage((await usageRes.json()) as UsageResponse);
      setLastUpdated(
        new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load usage');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  // Plan label source of truth = the billing store's subscription tier (same as
  // BillingSection), so Usage and Billing never disagree. Fall back to /api/usage's
  // plan_tier, then 'free', when the billing store hasn't hydrated.
  const billingTier = useBillingStore((s) => s.subscription?.tier);
  const rawTier = usage?.plan_tier ?? billingTier ?? 'free';
  const planName = getBillingPlanPricing(rawTier).label;
  const usedPercent = normalizeUsagePercentage(usage?.usage_percentage);
  const sessionUsedPercent = normalizeUsagePercentage(usage?.session_usage_percentage);
  const weeklyUsedPercent = normalizeUsagePercentage(usage?.weekly_usage_percentage);

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
          Usage
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Your plan usage and reset schedule.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-elev)',
            padding: 14,
            color: 'var(--text-2)',
            fontSize: 13,
          }}
        >
          {error}
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
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
            Plan usage limits
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--text-3)',
              background: 'var(--bg-hover, rgba(255,255,255,0.05))',
              border: '1px solid var(--settings-border)',
              borderRadius: 4,
              padding: '2px 8px',
            }}
          >
            {planName}
          </span>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <UsageBar
            label="Rolling 5 hours"
            percent={sessionUsedPercent}
            value={`${sessionUsedPercent}% used`}
            detail={`${100 - sessionUsedPercent}% remaining · ${formatReset(usage?.session_reset_at ?? null, 'rolling')}`}
          />
          <UsageBar
            label="Rolling 7 days"
            percent={weeklyUsedPercent}
            value={`${weeklyUsedPercent}% used`}
            detail={`${100 - weeklyUsedPercent}% remaining · ${formatReset(usage?.weekly_reset_at ?? null, 'rolling')}`}
          />
          <UsageBar
            label="Account month"
            percent={usedPercent}
            value={`${usedPercent}% used`}
            detail={`${100 - usedPercent}% remaining · ${formatReset(usage?.usage_reset_at ?? null, 'period')}`}
          />
        </div>

        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Last updated: {lastUpdated}</span>
          <button
            type="button"
            onClick={() => void loadUsage()}
            disabled={refreshing}
            aria-label="Refresh usage data"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              background: 'transparent',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-3)',
              fontSize: 12,
              cursor: refreshing ? 'default' : 'pointer',
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            <RefreshCw
              size={12}
              style={{ animation: refreshing ? 'spin 0.6s linear infinite' : 'none' }}
            />
            Refresh
          </button>
        </div>
      </section>
    </div>
  );
}
