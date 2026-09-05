'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  formatUsageRemaining,
  formatUsageResetIn,
  managedUsageBucketLabel,
} from '@agiworkforce/types';
import { getUsageUrgency } from '@agiworkforce/unified-chat';
import { RefreshCw } from 'lucide-react';
import { Progress } from '@agiworkforce/ui';
import { normalizeUsagePercentage } from '@agiworkforce/types';
import { useManagedUsageSummary } from '@/lib/hooks/useManagedUsageSummary';

const MINUTE_MS = 60 * 1000;

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
  detail,
  unknown = false,
}: {
  label: string;
  percent: number;
  detail: string;
  /**
   * No figure could be read from the server. Rendering the computed number
   * here would claim a FULL allowance, because an absent percentage
   * normalises to 0 used and the bar shows `100 - 0`. A usage meter that
   * fails optimistic is worse than one that admits it does not know: the
   * user plans around headroom they may not have.
   */
  unknown?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>{label}</span>
        {/*
          The headline number reads the SAME direction the bar fills. It used to
          print the remaining share beside a bar that fills with the consumed
          share, so a full allowance ("100% left") rendered as an empty bar and
          an exhausted one ("None left") as a full bar. The remaining figure
          still leads the detail line below, where the reset time gives it
          meaning.
        */}
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {unknown ? 'Unavailable' : `${Math.max(0, Math.min(100, Math.round(percent)))}% used`}
        </span>
      </div>
      {/*
        Colour tracks the SAME severity ladder every other surface uses
        (getUsageUrgency: >=95 critical, >=90 warning). This bar previously
        painted the accent colour at every value, so a user one percent from
        being cut off saw exactly what a user at 5% saw.
      */}
      <Progress
        value={unknown ? 0 : percent}
        aria-label={unknown ? `${label} usage unavailable` : `${label} usage`}
        aria-valuetext={unknown ? 'Unavailable' : detail}
        className="h-2"
        indicatorClassName={
          getUsageUrgency(percent) === 'critical'
            ? 'bg-[var(--chat-danger,#dc2626)]'
            : getUsageUrgency(percent) === 'warning'
              ? 'bg-[var(--chat-warning,#d97706)]'
              : 'bg-[var(--chat-accent-primary)]'
        }
        style={{ background: 'var(--chat-border-strong)' }}
      />
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
        {unknown ? 'Could not read your usage. Retry to load it.' : detail}
      </span>
    </div>
  );
}

function usageDetail(percentRemaining: number, resetAt: string | null, nowMs: number): string {
  const remaining = formatUsageRemaining(percentRemaining);
  const resets = formatUsageResetIn(resetAt, nowMs);
  if (!resets) return remaining;
  return `${remaining} · ${resets} (${formatAbsolute(resetAt as string)})`;
}

export function UsageSection() {
  const { usage, loading, error, lastUpdatedAt, stale, refresh } = useManagedUsageSummary();

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);

  // A missing payload normalises to 0 used, which renders as a FULL allowance.
  // Gate every bar on having actually read a figure rather than letting the
  // fallback speak for the server.
  const usageUnknown = !usage;
  const usedPercent = normalizeUsagePercentage(usage?.usage_percentage);
  const sessionUsedPercent = normalizeUsagePercentage(usage?.session_usage_percentage);
  const weeklyUsedPercent = normalizeUsagePercentage(usage?.weekly_usage_percentage);
  const flagshipWeeklyUsedPercent = normalizeUsagePercentage(
    usage?.flagship_weekly_usage_percentage,
  );

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return loading ? 'Loading…' : 'Never';
    const time = lastUpdatedAt.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return stale ? `${time} (refresh failed)` : time;
  }, [lastUpdatedAt, loading, stale]);

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
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
            Plan usage limits
          </span>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/*
            Labels, remaining-phrasing and reset wording all come from the shared
            vocabulary in @agiworkforce/types. These four buckets are the same
            server-side numbers mobile, desktop and the Chrome panel render, and
            each surface previously named them differently, "Rolling 5 hours"
            here, "Current session" on mobile, "Token Budget Usage" on desktop.
            so the same limit was unrecognisable between surfaces.
          */}
          <UsageBar
            unknown={usageUnknown}
            label={managedUsageBucketLabel('session')}
            percent={sessionUsedPercent}
            detail={usageDetail(100 - sessionUsedPercent, usage?.session_reset_at ?? null, nowMs)}
          />
          <UsageBar
            unknown={usageUnknown}
            label={managedUsageBucketLabel('weekly')}
            percent={weeklyUsedPercent}
            detail={usageDetail(100 - weeklyUsedPercent, usage?.weekly_reset_at ?? null, nowMs)}
          />
          <UsageBar
            unknown={usageUnknown}
            label={managedUsageBucketLabel('weeklyFlagship')}
            percent={flagshipWeeklyUsedPercent}
            detail={usageDetail(
              100 - flagshipWeeklyUsedPercent,
              usage?.flagship_weekly_reset_at ?? null,
              nowMs,
            )}
          />
          <UsageBar
            unknown={usageUnknown}
            label={managedUsageBucketLabel('period')}
            percent={usedPercent}
            detail={usageDetail(100 - usedPercent, usage?.usage_reset_at ?? null, nowMs)}
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
