'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Progress } from '@shared/ui/progress';
import { useBillingStore } from '@/stores/unified/auth';

type UsageResponse = {
  plan_tier: string;
  credits_allocated_cents: number;
  credits_used_cents: number;
  credits_remaining_cents: number;
  usage_percentage: number;
  period_end: string | null;
  daily_used_cents: number;
  daily_limit_cents: number;
  subscription_status: string;
};

type AnalyticsResponse = {
  stats?: {
    sessions_count: number;
    today_cost: number;
    today_tokens: number;
    week_cost: number;
    month_cost: number;
    total_tokens: number;
  };
};

function money(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function formatReset(value: string | null): string {
  if (!value) return 'No reset scheduled';
  return `Resets ${new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
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
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('Not loaded');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [usageRes, analyticsRes] = await Promise.all([
        fetch('/api/usage', { credentials: 'include' }),
        fetch('/api/usage/analytics?timeRange=30d', { credentials: 'include' }),
      ]);

      if (!usageRes.ok) throw new Error('Could not load usage');

      setUsage((await usageRes.json()) as UsageResponse);
      if (analyticsRes.ok) {
        setAnalytics((await analyticsRes.json()) as AnalyticsResponse);
      } else {
        setAnalytics(null);
      }
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
  const planName = rawTier[0]!.toUpperCase() + rawTier.slice(1);
  const creditPercent = Math.min(100, Math.max(0, usage?.usage_percentage ?? 0));

  // "Today" bar: today_cost vs monthly allocation (prorated for a single day).
  // Denominator is 1/30 of the monthly allocation so a full day's run reads as ~100%.
  // Falls back to monthly allocation as denominator when prorate is 0.
  const todayPercent = useMemo(() => {
    const allocated = usage?.credits_allocated_cents ?? 0;
    const todayCost = analytics?.stats?.today_cost ?? 0;
    const dailyAllocation = allocated > 0 ? Math.round(allocated / 30) : 0;
    return dailyAllocation > 0 ? Math.min(100, Math.round((todayCost / dailyAllocation) * 100)) : 0;
  }, [analytics, usage]);

  // "Weekly usage" bar: week_cost vs prorated weekly allocation (7/30 of monthly).
  // Using a prorated denominator keeps the bar meaningful and comparable to the monthly bar.
  const weeklyPercent = useMemo(() => {
    const allocated = usage?.credits_allocated_cents ?? 0;
    const weekCost = analytics?.stats?.week_cost ?? 0;
    const weeklyAllocation = allocated > 0 ? Math.round((allocated * 7) / 30) : 0;
    return weeklyAllocation > 0
      ? Math.min(100, Math.round((weekCost / weeklyAllocation) * 100))
      : 0;
  }, [analytics, usage]);

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
          Plan usage, credits, and recent activity from your account ledger.
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
          {/* Subscription-usage framing (Claude-style): percentage + progress +
              reset date are the primary metrics. Internal provider/credit dollar
              figures live in the collapsed "Cost details" section below, not here. */}
          <UsageBar
            label="Today"
            percent={todayPercent}
            value={`${todayPercent}% used`}
            detail={`${(analytics?.stats?.today_tokens ?? 0).toLocaleString()} tokens today · resets daily`}
          />

          <UsageBar
            label="This week"
            percent={weeklyPercent}
            value={`${weeklyPercent}% used`}
            detail="Resets weekly"
          />

          <UsageBar
            label="This month"
            percent={creditPercent}
            value={`${creditPercent}% used`}
            detail={`${formatReset(usage?.period_end ?? null)} · ${analytics?.stats?.sessions_count ?? 0} sessions in last 30 days`}
          />

          {/* Advanced: internal provider/credit cost accounting. Hidden by default —
              users think in subscription usage, not internal provider dollars. */}
          <details style={{ marginTop: 4 }}>
            <summary
              style={{
                fontSize: 12,
                color: 'var(--text-3)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              Cost details (advanced)
            </summary>
            <div
              style={{
                marginTop: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 12,
                color: 'var(--text-3)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Monthly credit allowance</span>
                <span>{money(usage?.credits_allocated_cents ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Used this period</span>
                <span>{money(usage?.credits_used_cents ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Remaining</span>
                <span>{money(usage?.credits_remaining_cents ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Spent today / this week</span>
                <span>
                  {money(analytics?.stats?.today_cost ?? 0)} /{' '}
                  {money(analytics?.stats?.week_cost ?? 0)}
                </span>
              </div>
            </div>
          </details>
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
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Additional features
        </div>
        <div style={{ padding: 20 }}>
          <UsageBar
            label="Daily included routine runs"
            percent={0}
            value="0 runs today"
            detail="Hosted routines unlock when managed execution controls are enabled for your account"
          />
        </div>
      </section>
    </div>
  );
}
