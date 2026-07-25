'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Progress } from '@agiworkforce/ui';
import { getBillingPlanPricing, normalizeUsagePercentage } from '@agiworkforce/types';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { useManagedUsageSummary } from '@/lib/hooks/useManagedUsageSummary';

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * PAR-3: a localizable RELATIVE countdown.
 *
 * `formatReset` only ever produced an absolute timestamp ("Resets Jul 26, 2026,
 * 4:00 PM"), which makes a user work out how long they have to wait. The public
 * contract carries the reset instant (and `seconds_until_reset` on
 * `ManagedUsageBalance`), so the remaining time is derivable — it was simply
 * never shown.
 */
function formatRelativeReset(value: string | null, nowMs: number): string | null {
  if (!value) return null;
  const target = Date.parse(value);
  if (Number.isNaN(target)) return null;

  const deltaMs = target - nowMs;
  if (deltaMs <= 0) return 'now';

  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (deltaMs < HOUR_MS) {
    return relative.format(Math.max(1, Math.round(deltaMs / MINUTE_MS)), 'minute');
  }
  if (deltaMs < DAY_MS) {
    return relative.format(Math.round(deltaMs / HOUR_MS), 'hour');
  }
  return relative.format(Math.round(deltaMs / DAY_MS), 'day');
}

function formatAbsolute(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * PAR-3: absolute instant AND relative countdown, so a user can both plan
 * ("in about 3 hours") and verify ("Jul 26, 4:00 PM").
 */
function formatReset(value: string | null, kind: 'rolling' | 'period', nowMs: number): string {
  if (!value) return kind === 'rolling' ? 'No usage in this window' : 'No reset scheduled';
  const relative = formatRelativeReset(value, nowMs);
  const absolute = formatAbsolute(value);
  const lead = kind === 'rolling' ? 'Capacity refreshes' : 'Resets';
  return relative ? `${lead} ${relative} (${absolute})` : `${lead} ${absolute}`;
}

/**
 * GOV-19: `useManagedUsageSummary` / `getWorstUsagePercent` moved to
 * `@/lib/hooks/useManagedUsageSummary` so the chat page can wire the shared
 * Sidebar's usage widget without importing a settings SECTION COMPONENT
 * module. Re-exported here so this file remains the discoverable entry point
 * for the Settings > Usage surface and any existing importer keeps working.
 */
export {
  getWorstUsagePercent,
  useManagedUsageSummary,
  type ManagedUsageSummaryState,
} from '@/lib/hooks/useManagedUsageSummary';

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
  const { usage, loading, error, lastUpdatedAt, stale, refresh } = useManagedUsageSummary();

  // Recomputed on every render tick that matters; the relative countdown is
  // derived from this so it does not silently freeze at its first value.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);

  // Plan label source of truth = the billing store's subscription tier (same as
  // BillingSection), so Usage and Billing never disagree. Fall back to /api/usage's
  // plan_tier, then 'free', when the billing store hasn't hydrated.
  const billingTier = useBillingStore((s) => s.subscription?.tier);
  const rawTier = usage?.plan_tier ?? billingTier ?? 'free';
  const planName = getBillingPlanPricing(rawTier).label;
  const usedPercent = normalizeUsagePercentage(usage?.usage_percentage);
  const sessionUsedPercent = normalizeUsagePercentage(usage?.session_usage_percentage);
  const weeklyUsedPercent = normalizeUsagePercentage(usage?.weekly_usage_percentage);
  // PAR-1: the contract has carried `flagship_weekly_*` end to end all along and
  // this component simply never destructured it — so a user could sit at 100%
  // on the expensive model family while the aggregate bar read 60%, then hit a
  // wall with no warning.
  const flagshipWeeklyUsedPercent = normalizeUsagePercentage(
    usage?.flagship_weekly_usage_percentage,
  );

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return loading ? 'Loading…' : 'Never';
    const time = lastUpdatedAt.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    // PAR-4: say so when the figures on screen are older than the last attempt.
    return stale ? `${time} (refresh failed)` : time;
  }, [lastUpdatedAt, loading, stale]);

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
            detail={`${100 - sessionUsedPercent}% remaining · ${formatReset(usage?.session_reset_at ?? null, 'rolling', nowMs)}`}
          />
          <UsageBar
            label="Rolling 7 days"
            percent={weeklyUsedPercent}
            value={`${weeklyUsedPercent}% used`}
            detail={`${100 - weeklyUsedPercent}% remaining · ${formatReset(usage?.weekly_reset_at ?? null, 'rolling', nowMs)}`}
          />
          <UsageBar
            label="Most capable models · 7 days"
            percent={flagshipWeeklyUsedPercent}
            value={`${flagshipWeeklyUsedPercent}% used`}
            detail={`${100 - flagshipWeeklyUsedPercent}% remaining · ${formatReset(usage?.flagship_weekly_reset_at ?? null, 'rolling', nowMs)}`}
          />
          <UsageBar
            label="Account month"
            percent={usedPercent}
            value={`${usedPercent}% used`}
            detail={`${100 - usedPercent}% remaining · ${formatReset(usage?.usage_reset_at ?? null, 'period', nowMs)}`}
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
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Last updated: {lastUpdatedLabel}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
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
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshCw
              size={12}
              style={{ animation: loading ? 'spin 0.6s linear infinite' : 'none' }}
            />
            Refresh
          </button>
        </div>
      </section>
    </div>
  );
}
