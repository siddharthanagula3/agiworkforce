'use client';

import { useEffect, useMemo, useState } from 'react';
import { SettingsPageLink } from '../components/SettingsSectionLink';
import {
  creditsFromCents,
  formatCreditWindowUsage,
  formatCredits,
  formatPlanCreditAllowanceLine,
  formatUsageRemaining,
  formatUsageResetIn,
  getBillingPlanPricing,
  getModelMetadataById,
  isBillingPlanTier,
  isContractPricedPlan,
  isFreeBillingPlanTier,
  managedUsageBucketLabel,
  type ManagedUsageCreditWindow,
} from '@agiworkforce/types';
import { usageWorkloadLabel } from '@/lib/billing/usage-attribution';
import { getUsageUrgency } from '@agiworkforce/unified-chat';
import { RefreshCw } from 'lucide-react';
import { Progress } from '@agiworkforce/ui';
import { normalizeUsagePercentage } from '@agiworkforce/types';
import { useManagedUsageSummary } from '@/lib/hooks/useManagedUsageSummary';
import { FREE_TRIAL_MODEL } from '@/lib/free-trial-config';

const MINUTE_MS = 60 * 1000;
const FREE_TRIAL_MODEL_NAME =
  getModelMetadataById(FREE_TRIAL_MODEL)?.name ?? 'the included free router';

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

/**
 * Credits are the only unit a customer sees, so they lead the line whenever the
 * server states them. The percentage wording stays as the fallback for a plan
 * with no allowance to name and for a server older than the credits block.
 */
function usageDetail(
  percentRemaining: number,
  resetAt: string | null,
  nowMs: number,
  window?: ManagedUsageCreditWindow | null,
): string {
  const remaining = window
    ? formatCreditWindowUsage(window.used, window.allowance)
    : formatUsageRemaining(percentRemaining);
  const resets = formatUsageResetIn(resetAt, nowMs);
  if (!resets) return remaining;
  return `${remaining} · ${resets} (${formatAbsolute(resetAt as string)})`;
}

interface UsageHistoryRow {
  key: string;
  requests: number;
  costCents: number;
}

interface UsageHistoryPayload {
  from: string;
  to: string;
  totals: { requests: number; costCents: number };
  daily: { day: string; requests: number; costCents: number }[];
  byWorkload: UsageHistoryRow[];
  byModel: UsageHistoryRow[];
  freshness: { asOf: string; latestActivityAt: string | null; unsettledRequests: number };
}

interface UsageHistoryState {
  history: UsageHistoryPayload | null;
  loading: boolean;
  error: string | null;
}

function historyRows(value: unknown): UsageHistoryRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const { key, requests, costCents } = row as Record<string, unknown>;
    if (typeof key !== 'string' || typeof requests !== 'number' || typeof costCents !== 'number') {
      return [];
    }
    return [{ key, requests, costCents }];
  });
}

/**
 * A body that is not this shape is not a smaller answer, it is a different
 * endpoint answering, and rendering it would state someone else's numbers as
 * this account's spend.
 */
function parseUsageHistory(value: unknown): UsageHistoryPayload | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  const totals = payload['totals'];
  const freshness = payload['freshness'];
  if (!totals || typeof totals !== 'object' || !freshness || typeof freshness !== 'object') {
    return null;
  }
  const { requests, costCents } = totals as Record<string, unknown>;
  const { unsettledRequests } = freshness as Record<string, unknown>;
  if (typeof requests !== 'number' || typeof costCents !== 'number') return null;

  const days = Array.isArray(payload['daily']) ? payload['daily'] : [];
  return {
    from: String(payload['from'] ?? ''),
    to: String(payload['to'] ?? ''),
    totals: { requests, costCents },
    daily: historyRows(
      days.map((day) => ({ ...(day as object), key: (day as Record<string, unknown>)?.['day'] })),
    ).map((row) => ({ day: row.key, requests: row.requests, costCents: row.costCents })),
    byWorkload: historyRows(payload['byWorkload']),
    byModel: historyRows(payload['byModel']),
    freshness: {
      asOf: String((freshness as Record<string, unknown>)['asOf'] ?? ''),
      latestActivityAt: null,
      unsettledRequests: typeof unsettledRequests === 'number' ? unsettledRequests : 0,
    },
  };
}

function useAccountUsageHistory(enabled: boolean): UsageHistoryState & { reload: () => void } {
  const [state, setState] = useState<UsageHistoryState>({
    history: null,
    loading: false,
    error: null,
  });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: null }));
    void (async () => {
      try {
        const response = await fetch('/api/usage/history', {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const history = parseUsageHistory(await response.json());
        if (!history) throw new Error('unrecognised usage history');
        setState({ history, loading: false, error: null });
      } catch {
        if (controller.signal.aborted) return;
        setState({ history: null, loading: false, error: 'Could not load your usage history.' });
      }
    })();
    return () => controller.abort();
  }, [enabled, reloadToken]);

  return { ...state, reload: () => setReloadToken((token) => token + 1) };
}

const HISTORY_DAY_LIMIT = 14;
const HISTORY_ROW_LIMIT = 8;

function formatDay(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function HistoryRows({
  caption,
  rows,
  labelFor,
}: {
  caption: string;
  rows: readonly UsageHistoryRow[];
  labelFor?: (key: string) => string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{caption}</span>
      {rows.map((row) => (
        <div
          key={row.key}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: 12,
            color: 'var(--text-3)',
          }}
        >
          <span style={{ color: 'var(--text-2)' }}>{labelFor ? labelFor(row.key) : row.key}</span>
          <span>
            {`${row.requests} ${row.requests === 1 ? 'turn' : 'turns'} · ${formatCredits(
              creditsFromCents(row.costCents),
            )}`}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The meters above answer how much is left. This answers what it went on,
 * which is the next thing anyone asks when a meter surprises them, and until
 * this existed only a workspace administrator could see it.
 */
function UsageHistorySection({ enabled }: { enabled: boolean }) {
  const { history, loading, error, reload } = useAccountUsageHistory(enabled);
  if (!enabled) return null;

  const dailyRows: UsageHistoryRow[] = (history?.daily ?? [])
    .slice(-HISTORY_DAY_LIMIT)
    .reverse()
    .map((day) => ({ key: day.day, requests: day.requests, costCents: day.costCents }));

  const isEmpty = history !== null && !loading && !error && history.totals.requests === 0;

  return (
    <section
      aria-labelledby="usage-history-heading"
      style={{
        border: '1px solid var(--settings-border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-elev)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--settings-border)' }}>
        <span
          id="usage-history-heading"
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}
        >
          Where your usage went
        </span>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>
          Settled usage from the last 30 days. Turns still settling are not counted yet.
        </p>
      </div>

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {loading && (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading usage history…</span>
        )}

        {error && !loading && (
          <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{error}</span>
            <button
              type="button"
              onClick={reload}
              style={{
                alignSelf: 'flex-start',
                padding: '4px 8px',
                background: 'transparent',
                border: '1px solid var(--settings-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-3)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        )}

        {isEmpty && (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            No settled usage in the last 30 days.
          </span>
        )}

        {history && !loading && !error && history.totals.requests > 0 && (
          <>
            <HistoryRows
              caption="By product area"
              rows={history.byWorkload.slice(0, HISTORY_ROW_LIMIT)}
              labelFor={usageWorkloadLabel}
            />
            <HistoryRows
              caption="By model"
              rows={history.byModel.slice(0, HISTORY_ROW_LIMIT)}
              labelFor={(key) => getModelMetadataById(key)?.name ?? key}
            />
            <HistoryRows caption="By day" rows={dailyRows} labelFor={formatDay} />
            {history.freshness.unsettledRequests > 0 && (
              <span role="status" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {`${history.freshness.unsettledRequests} ${
                  history.freshness.unsettledRequests === 1 ? 'turn is' : 'turns are'
                } still settling and are not counted above.`}
              </span>
            )}
          </>
        )}
      </div>
    </section>
  );
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

  const credits = usage?.credits ?? null;
  const isFreePlan = usage ? isFreeBillingPlanTier(usage.plan_tier) : false;
  const planAllowanceLine = useMemo(() => {
    if (!usage || !credits) return null;
    const tier = usage.plan_tier.trim().toLowerCase();
    const planLabel = isBillingPlanTier(tier) ? getBillingPlanPricing(tier).label : usage.plan_tier;
    return formatPlanCreditAllowanceLine(planLabel, {
      monthly: credits.monthly.allowance,
      weekly: credits.weekly.allowance,
      fiveHour: credits.five_hour.allowance,
    });
  }, [credits, usage]);

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
          {isFreePlan
            ? 'Use free models now, or join the waitlist for a paid plan.'
            : 'Your plan usage and reset schedule.'}
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
            {isFreePlan ? 'Upgrade for higher capacity' : 'Plan usage limits'}
          </span>
          {!isFreePlan && planAllowanceLine && (
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '4px 0 0' }}>
              {planAllowanceLine}
            </p>
          )}
          {!isFreePlan && credits && credits.purchased.remaining !== null && (
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
              {`Purchased credits: ${formatCredits(credits.purchased.remaining)} remaining, separate from your plan allowance.`}
            </p>
          )}
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
          {isFreePlan ? (
            <div className="space-y-3 text-sm text-[var(--text-2)]">
              <p>
                Free accounts can use {FREE_TRIAL_MODEL_NAME} and available QwenCloud promotional
                quota. Paid plans add higher capacity and more model choices.
              </p>
              <SettingsPageLink
                href="/pricing"
                className="text-primary underline underline-offset-4"
              >
                Compare plans and join the upgrade waitlist
              </SettingsPageLink>
            </div>
          ) : usage && isContractPricedPlan(usage.plan_tier) ? (
            <div className="space-y-3 text-sm text-[var(--text-2)]">
              <p>Your usage allowances and billing are set by your workspace contract.</p>
              <SettingsPageLink
                href="/workspace/usage"
                className="text-primary underline underline-offset-4"
              >
                View workspace usage
              </SettingsPageLink>
            </div>
          ) : (
            <>
              <UsageBar
                unknown={usageUnknown}
                label={managedUsageBucketLabel('session')}
                percent={sessionUsedPercent}
                detail={usageDetail(
                  100 - sessionUsedPercent,
                  usage?.session_reset_at ?? null,
                  nowMs,
                  credits?.five_hour,
                )}
              />
              <UsageBar
                unknown={usageUnknown}
                label={managedUsageBucketLabel('weekly')}
                percent={weeklyUsedPercent}
                detail={usageDetail(
                  100 - weeklyUsedPercent,
                  usage?.weekly_reset_at ?? null,
                  nowMs,
                  credits?.weekly,
                )}
              />
              <UsageBar
                unknown={usageUnknown}
                label={managedUsageBucketLabel('weeklyFlagship')}
                percent={flagshipWeeklyUsedPercent}
                detail={usageDetail(
                  100 - flagshipWeeklyUsedPercent,
                  usage?.flagship_weekly_reset_at ?? null,
                  nowMs,
                  credits?.flagship_weekly,
                )}
              />
              <UsageBar
                unknown={usageUnknown}
                label={managedUsageBucketLabel('period')}
                percent={usedPercent}
                detail={usageDetail(
                  100 - usedPercent,
                  usage?.usage_reset_at ?? null,
                  nowMs,
                  credits?.monthly,
                )}
              />
            </>
          )}
        </div>

        {!isFreePlan && (
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
        )}
      </section>

      {/*
        A contract-priced workspace reads its usage in the workspace console,
        where the same rows are grouped per member. Free states its usage as a
        meter and a reset time only, so a credit figure never appears for it.
      */}
      <UsageHistorySection
        enabled={usage !== null && !isFreePlan && !isContractPricedPlan(usage.plan_tier)}
      />
    </div>
  );
}
