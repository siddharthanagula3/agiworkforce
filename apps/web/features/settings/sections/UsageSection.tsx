'use client';

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { Progress, SegmentedControl, Spinner, translateUiPlural } from '@agiworkforce/ui';
import { getUsageUrgency } from '@agiworkforce/unified-chat';
import {
  formatCreditWindowUsage,
  formatCredits,
  formatPlanCreditAllowanceLine,
  formatUsageRemaining,
  formatUsageResetIn,
  getBillingPlanPricing,
  getModelMetadataById,
  MONTHLY_METERED_UNIT_COPY,
  type MonthlyMeteredUnit,
  isBillingPlanTier,
  isContractPricedPlan,
  isFreeBillingPlanTier,
  managedUsageBucketLabel,
  normalizeUsagePercentage,
  parseAccountUsageHistoryResponse,
  parseAccountUsageLimitsResponse,
  type AccountUsageHistoryResponse,
  type AccountUsageLimitsResponse,
  type ManagedUsageCreditWindow,
  type ManagedUsageSummaryResponse,
  type TierUnitUsage,
} from '@agiworkforce/types';
import { usageWorkloadLabel } from '@/lib/billing/usage-attribution';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useManagedUsageSummary } from '@/lib/hooks/useManagedUsageSummary';
import { toUserMessage } from '@/lib/user-error-message';
import { SettingsPageLink, SettingsSectionLink } from '../components/SettingsSectionLink';
import { HelpArticleLink } from '@/features/support/components/HelpArticleLink';

type Granularity = AccountUsageHistoryResponse['granularity'];
type HistoryRow = Pick<
  AccountUsageHistoryResponse['byModel'][number],
  'key' | 'label' | 'requests' | 'credits'
>;
type AccountCredits = NonNullable<ManagedUsageSummaryResponse['credits']>;

const MINUTE_MS = 60 * 1000;
const HISTORY_ROW_LIMIT = 8;
const REPORT_WINDOW = 'window';
const LIMITS_FAILURE = 'Could not load this month’s usage.';

const CARD: CSSProperties = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
  overflow: 'hidden',
};
const CARD_HEADER: CSSProperties = {
  padding: 'var(--space-4) var(--space-5)',
  borderBottom: '1px solid var(--settings-border)',
};
const CARD_BODY: CSSProperties = {
  padding: 'var(--space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
  margin: 0,
};
const CARD_TITLE: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-2)',
  margin: 0,
};
const CARD_NOTE: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-3)',
  margin: 'var(--space-1) 0 0',
};
const DETAIL: CSSProperties = { fontSize: 12, color: 'var(--text-3)' };
const ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
};

const QUIET_BUTTON_CLASS =
  'inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[var(--settings-border)] px-2.5 text-xs font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50 pointer-coarse:min-h-11';
const PRIMARY_BUTTON_CLASS =
  'inline-flex min-h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 pointer-coarse:min-h-11';
const FIELD_CLASS =
  'w-full rounded-md border border-[var(--settings-border)] bg-background px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:opacity-60';

const GRANULARITY_OPTIONS: readonly { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Days' },
  { value: 'week', label: 'Weeks' },
  { value: 'month', label: 'Months' },
];

const GRANULARITY_UNIT: Record<Granularity, string> = {
  day: 'UTC day',
  week: 'UTC week, Monday to Sunday',
  month: 'UTC calendar month',
};

const GRANULARITY_CAPTION: Record<Granularity, string> = {
  day: 'By day',
  week: 'By week',
  month: 'By month',
};

function formatAbsolute(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCreditAmount(value: number): string {
  return formatCredits(value, { maximumFractionDigits: value > 0 && value < 10 ? 2 : 1 });
}

const UNIT_COUNT_KEYS: Readonly<Record<MonthlyMeteredUnit, string>> = {
  voice_minutes: 'counts.usageMinutes',
  video_seconds: 'counts.usageSeconds',
  computer_use_requests: 'counts.usageRequests',
};

function formatCount(value: number, key: string, one: string, many: string): string {
  return translateUiPlural(
    'settings',
    key,
    value,
    { one: `{{value}} ${one}`, other: `{{value}} ${many}` },
    { value: value.toLocaleString() },
  );
}

function formatUtcDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatWindow(history: AccountUsageHistoryResponse): string {
  return `${formatUtcDate(history.from)} to ${formatUtcDate(history.to)}`;
}

function formatPeriod(start: string, granularity: Granularity): string {
  const date = new Date(start);
  if (granularity === 'month') {
    return date.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' });
  }
  const day = date.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
  return granularity === 'week' ? `Week of ${day}` : day;
}

function periodEnd(start: string, granularity: Granularity): string {
  const date = new Date(start);
  if (granularity === 'month') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString();
  }
  const days = granularity === 'week' ? 7 : 1;
  return new Date(date.getTime() + days * 24 * 60 * MINUTE_MS).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface Loadable<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function useUsageResource<T>(
  url: string | null,
  parse: (value: unknown) => T | null,
  failure: string,
): Loadable<T> {
  const [state, setState] = useState<Omit<Loadable<T>, 'reload'>>({
    data: null,
    loading: false,
    error: null,
  });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: null }));
    void (async () => {
      try {
        const response = await fetch(url, { credentials: 'include', signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const data = parse(await response.json());
        if (!data) throw new Error('unrecognised usage response');
        setState({ data, loading: false, error: null });
      } catch {
        if (controller.signal.aborted) return;
        setState({ data: null, loading: false, error: failure });
      }
    })();
    return () => controller.abort();
  }, [url, parse, failure, reloadToken]);

  return { ...state, reload: () => setReloadToken((token) => token + 1) };
}

function RetryNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{message}</span>
      <button type="button" onClick={onRetry} className={`${QUIET_BUTTON_CLASS} self-start`}>
        Try again
      </button>
    </div>
  );
}

function LoadingNotice({ label }: { label: string }) {
  return (
    <div
      role="status"
      style={{ ...DETAIL, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
    >
      <Spinner size="sm" aria-hidden="true" />
      {label}
    </div>
  );
}

function UsageBar({
  label,
  percent,
  detail,
  unknown = false,
}: {
  label: string;
  percent: number;
  detail: string;
  unknown?: boolean;
}) {
  const urgency = getUsageUrgency(percent);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={ROW}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>{label}</span>
        <span style={DETAIL}>
          {unknown ? 'Unavailable' : `${Math.max(0, Math.min(100, Math.round(percent)))}% used`}
        </span>
      </div>
      <Progress
        value={unknown ? 0 : percent}
        aria-label={unknown ? `${label} usage unavailable` : `${label} usage`}
        aria-valuetext={unknown ? 'Unavailable' : detail}
        className="h-2"
        indicatorClassName={
          urgency === 'critical'
            ? 'bg-[var(--chat-destructive)]'
            : urgency === 'warning'
              ? 'bg-[var(--chat-warning)]'
              : 'bg-[var(--chat-accent-primary)]'
        }
        style={{ background: 'var(--chat-border-strong)' }}
      />
      <span style={DETAIL}>
        {unknown ? 'Could not read your usage. Retry to load it.' : detail}
      </span>
    </div>
  );
}

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
  if (!resets || !resetAt) return remaining;
  return `${remaining} · ${resets} (${formatAbsolute(resetAt)})`;
}

function BalanceRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <div style={ROW}>
        <dt style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>{label}</dt>
        <dd style={{ fontSize: 13, color: 'var(--text-1)', margin: 0 }}>{value}</dd>
      </div>
      <dd style={{ ...DETAIL, margin: 0 }}>{detail}</dd>
    </div>
  );
}

function bonusRow(bonus: AccountCredits['bonus']): { value: string; detail: string } {
  if (!bonus) {
    return { value: 'Unavailable', detail: 'Could not read your bonus credits. Refresh to retry.' };
  }
  if (bonus.remaining <= 0) {
    return {
      value: 'None',
      detail: 'Credits from referrals and promotions show here with the date they expire.',
    };
  }
  return {
    value: formatCreditAmount(bonus.remaining),
    detail: bonus.next_expiry_at
      ? `Next expiry ${formatAbsolute(bonus.next_expiry_at)}`
      : 'No expiry date recorded.',
  };
}

function purchasedRow(
  purchased: AccountCredits['purchased'],
  expiry: AccountCredits['purchase_expiry'],
): { value: string; detail: string } {
  if (purchased.remaining === null) {
    return {
      value: 'Unavailable',
      detail: 'Could not read your purchased credits. Refresh to retry.',
    };
  }
  return {
    value: purchased.remaining > 0 ? formatCreditAmount(purchased.remaining) : 'None',
    detail:
      expiry && expiry.expiring_credits > 0 && expiry.next_expiry_at
        ? `${formatCreditAmount(expiry.expiring_credits)} expire as local law requires where they were bought, the next on ${formatAbsolute(expiry.next_expiry_at)}. The rest don't expire.`
        : "Purchased credits don't expire.",
  };
}

function CreditBalancesCard({ credits }: { credits: AccountCredits }) {
  const bonus = bonusRow(credits.bonus);
  const purchased = purchasedRow(credits.purchased, credits.purchase_expiry);
  return (
    <section aria-labelledby="usage-balances-heading" style={CARD}>
      <div style={CARD_HEADER}>
        <h2 id="usage-balances-heading" style={CARD_TITLE}>
          Credit balances
        </h2>
        <p style={CARD_NOTE}>
          Once a plan limit is reached, bonus credits are used first, soonest to expire, then
          purchased credits.
        </p>
      </div>
      <dl style={CARD_BODY}>
        <BalanceRow label="Bonus credits" value={bonus.value} detail={bonus.detail} />
        <BalanceRow label="Purchased credits" value={purchased.value} detail={purchased.detail} />
      </dl>
    </section>
  );
}

function AllowanceRow({ unit }: { unit: TierUnitUsage }) {
  const copy = MONTHLY_METERED_UNIT_COPY[unit.unit];
  const limit = unit.hardLimit;
  const countKey = UNIT_COUNT_KEYS[unit.unit];
  const used = formatCount(unit.consumed, countKey, copy.one, copy.many);
  if (limit === null) {
    return (
      <div style={ROW}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>{copy.label}</span>
        <span style={DETAIL}>{`${used}, no monthly cap`}</span>
      </div>
    );
  }
  const percent = limit > 0 ? (unit.consumed / limit) * 100 : 100;
  return (
    <UsageBar
      label={copy.label}
      percent={percent}
      detail={`${unit.consumed.toLocaleString()} of ${formatCount(limit, countKey, copy.one, copy.many)} used`}
    />
  );
}

function RunningResponsesRow({ reading }: { reading: AccountUsageLimitsResponse['responses'] }) {
  if (!reading) return null;
  return (
    <div style={ROW}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
        Responses running now
      </span>
      <span style={DETAIL}>{`${reading.active} of ${reading.limit} at a time`}</span>
    </div>
  );
}

function MonthlyAllowancesCard({ resource }: { resource: Loadable<AccountUsageLimitsResponse> }) {
  const { data, loading, error, reload } = resource;
  if (!data && !loading && !error) return null;

  const units =
    data?.units.filter(
      (unit) => unit.hardLimit !== null || unit.softLimit !== null || unit.consumed > 0,
    ) ?? [];
  const showImages = (data?.images.requests ?? 0) > 0;
  if (data && units.length === 0 && !showImages) return null;

  return (
    <section aria-labelledby="usage-month-heading" style={CARD}>
      <div style={CARD_HEADER}>
        <h2 id="usage-month-heading" style={CARD_TITLE}>
          This month
        </h2>
        {data && <p style={CARD_NOTE}>{`Resets ${formatAbsolute(data.resetAt)}`}</p>}
      </div>
      <div style={CARD_BODY}>
        {loading && <LoadingNotice label="Loading this month’s usage" />}
        {error && !loading && <RetryNotice message={error} onRetry={reload} />}
        {data && !loading && !error && (
          <>
            {units.map((unit) => (
              <AllowanceRow key={unit.unit} unit={unit} />
            ))}
            {showImages && (
              <div style={ROW}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
                  Images
                </span>
                <span style={DETAIL}>
                  {`${formatCount(data.images.images, 'counts.usageImages', 'image', 'images')} · ${formatCreditAmount(data.images.credits)}`}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function HistoryRows({
  caption,
  rows,
  labelFor,
  limit = HISTORY_ROW_LIMIT,
}: {
  caption: string;
  rows: readonly HistoryRow[];
  labelFor: (row: HistoryRow) => string;
  limit?: number;
}) {
  if (rows.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>
        {caption}
      </h3>
      {rows.slice(0, limit).map((row) => (
        <div key={row.key} style={{ ...ROW, ...DETAIL }}>
          <span style={{ color: 'var(--text-2)', minWidth: 0, overflowWrap: 'anywhere' }}>
            {labelFor(row)}
          </span>
          <span style={{ flexShrink: 0 }}>
            {`${formatCount(row.requests, 'counts.usageRequests', 'request', 'requests')} · ${formatCreditAmount(row.credits)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function DiscrepancyReportForm({
  history,
  onClose,
}: {
  history: AccountUsageHistoryResponse;
  onClose: () => void;
}) {
  const [periodKey, setPeriodKey] = useState(REPORT_WINDOW);
  const [requestId, setRequestId] = useState('');
  const [reference, setReference] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<{ subject: string; staffNotified: boolean } | null>(null);

  const periods = [...history.periods].reverse();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (!message.trim()) {
      setError('Describe what looks wrong so support knows what to check.');
      return;
    }
    const window =
      periodKey === REPORT_WINDOW
        ? { from: history.from, to: history.to }
        : { from: periodKey, to: periodEnd(periodKey, history.granularity) };
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/usage/discrepancy', {
        method: 'POST',
        credentials: 'include',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...window,
          message: message.trim(),
          ...(requestId.trim() ? { requestId: requestId.trim() } : {}),
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const reason =
          isRecord(payload) && isRecord(payload['error']) ? payload['error']['message'] : null;
        throw new Error(typeof reason === 'string' ? reason : 'That report was not filed.');
      }
      const subject =
        isRecord(payload) && isRecord(payload['ticket']) ? payload['ticket']['subject'] : null;
      setFiled({
        subject: typeof subject === 'string' ? subject : 'Billing report',
        staffNotified: isRecord(payload) && payload['staffNotified'] === true,
      });
    } catch (submitError) {
      setError(toUserMessage(submitError, 'That report was not filed.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (filed) {
    return (
      <div
        role="status"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
      >
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
          {`Report filed as “${filed.subject}”, with the usage record for that period attached.`}
        </span>
        <span style={DETAIL}>
          {filed.staffNotified
            ? 'Support has been notified. Replies and status updates appear under Help.'
            : 'It is saved, but the notification to support did not send. Follow it under Help.'}
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <SettingsSectionLink
            section="help"
            className="text-xs text-primary underline underline-offset-4"
          >
            Open Help
          </SettingsSectionLink>
          <button type="button" onClick={onClose} className={QUIET_BUTTON_CLASS}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-foreground">Period</span>
        <select
          className={FIELD_CLASS}
          value={periodKey}
          disabled={submitting}
          onChange={(event) => setPeriodKey(event.target.value)}
        >
          <option value={REPORT_WINDOW}>{`Everything shown (${formatWindow(history)})`}</option>
          {periods.map((period) => (
            <option key={period.start} value={period.start}>
              {`${formatPeriod(period.start, history.granularity)} · ${formatCreditAmount(period.credits)}`}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-foreground">Request ID (optional)</span>
        <input
          className={FIELD_CLASS}
          value={requestId}
          disabled={submitting}
          autoComplete="off"
          spellCheck={false}
          placeholder="From the request_id column of the CSV"
          onChange={(event) => setRequestId(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-foreground">
          Invoice or charge reference (optional)
        </span>
        <input
          className={FIELD_CLASS}
          value={reference}
          disabled={submitting}
          autoComplete="off"
          placeholder="Invoice number, or the date and amount of the charge"
          onChange={(event) => setReference(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-foreground">What looks wrong</span>
        <textarea
          className={`${FIELD_CLASS} resize-y`}
          rows={4}
          value={message}
          disabled={submitting}
          onChange={(event) => setMessage(event.target.value)}
        />
      </label>
      {error && (
        <span role="alert" style={{ fontSize: 12, color: 'var(--chat-destructive-text)' }}>
          {error}
        </span>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button type="submit" disabled={submitting} className={PRIMARY_BUTTON_CLASS}>
          {submitting ? 'Filing report…' : 'File report'}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={onClose}
          className={QUIET_BUTTON_CLASS}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function UsageHistorySection({ enabled }: { enabled: boolean }) {
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [reporting, setReporting] = useState(false);
  const {
    data: history,
    loading,
    error,
    reload,
  } = useUsageResource(
    enabled ? `/api/usage/history?granularity=${granularity}` : null,
    parseAccountUsageHistoryResponse,
    'Could not load your usage history.',
  );
  if (!enabled) return null;

  const current = history?.granularity === granularity ? history : null;
  const periods = [...(current?.periods ?? [])].reverse().map((period) => ({
    key: period.start,
    label: null,
    requests: period.requests,
    credits: period.credits,
  }));
  const shown = loading || error ? null : current;

  return (
    <section aria-labelledby="usage-history-heading" style={CARD}>
      <div
        style={{ ...CARD_HEADER, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
      >
        <div>
          <h2 id="usage-history-heading" style={CARD_TITLE}>
            Where your usage went
          </h2>
          <p style={CARD_NOTE}>
            {`Settled usage by ${GRANULARITY_UNIT[granularity]}${
              current ? `, ${formatWindow(current)}` : ''
            }. Requests still settling are not counted yet.`}
          </p>
        </div>
        <SegmentedControl
          aria-label="Group usage history by"
          options={GRANULARITY_OPTIONS}
          value={granularity}
          onValueChange={(value) => {
            setGranularity(value);
            setReporting(false);
          }}
        />
      </div>

      <div style={CARD_BODY}>
        {loading && <LoadingNotice label="Loading usage history" />}
        {error && !loading && <RetryNotice message={error} onRetry={reload} />}

        {shown && shown.totals.requests === 0 && (
          <span style={DETAIL}>No settled usage in this period.</span>
        )}

        {shown && shown.totals.requests > 0 && (
          <>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {`${formatCount(shown.totals.requests, 'counts.usageRequests', 'request', 'requests')} · ${formatCreditAmount(shown.totals.credits)}`}
            </span>
            <HistoryRows
              caption={GRANULARITY_CAPTION[shown.granularity]}
              rows={periods}
              limit={periods.length}
              labelFor={(row) => formatPeriod(row.key, shown.granularity)}
            />
            <HistoryRows
              caption="By product area"
              rows={shown.byWorkload}
              labelFor={(row) => usageWorkloadLabel(row.key)}
            />
            <HistoryRows
              caption="By model"
              rows={shown.byModel}
              labelFor={(row) => row.label ?? getModelMetadataById(row.key)?.name ?? row.key}
            />
            <HistoryRows
              caption="By project"
              rows={shown.byProject}
              labelFor={(row) => row.label ?? 'Project not in this workspace'}
            />
            {shown.freshness.unsettledRequests > 0 && (
              <span role="status" style={DETAIL}>
                {translateUiPlural(
                  'settings',
                  'counts.usageRequestsSettling',
                  shown.freshness.unsettledRequests,
                  {
                    one: '{{value}} request is still settling and not counted above.',
                    other: '{{value}} requests are still settling and not counted above.',
                  },
                  { value: shown.freshness.unsettledRequests.toLocaleString() },
                )}
              </span>
            )}
          </>
        )}

        {shown && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <a
              href={`/api/usage/export?granularity=${granularity}`}
              download
              className={QUIET_BUTTON_CLASS}
            >
              Download CSV
            </a>
            {!reporting && (
              <button
                type="button"
                onClick={() => setReporting(true)}
                className={QUIET_BUTTON_CLASS}
              >
                Report a billing problem
              </button>
            )}
          </div>
        )}

        {shown && reporting && (
          <DiscrepancyReportForm history={shown} onClose={() => setReporting(false)} />
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

  const usageUnknown = !usage;
  const usedPercent = normalizeUsagePercentage(usage?.usage_percentage);
  const sessionUsedPercent = normalizeUsagePercentage(usage?.session_usage_percentage);
  const weeklyUsedPercent = normalizeUsagePercentage(usage?.weekly_usage_percentage);
  const flagshipWeeklyUsedPercent = normalizeUsagePercentage(
    usage?.flagship_weekly_usage_percentage,
  );

  const credits = usage?.credits ?? null;
  const isFreePlan = usage ? isFreeBillingPlanTier(usage.plan_tier) : false;
  const contractPriced = usage ? isContractPricedPlan(usage.plan_tier) : false;
  const showFlagship = credits ? credits.flagship_weekly !== null : true;
  const limits = useUsageResource(
    usage !== null && !contractPriced ? '/api/usage/limits' : null,
    parseAccountUsageLimitsResponse,
    LIMITS_FAILURE,
  );

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
          Usage
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Your plan limits in credits, when each one resets, and where your credits went.
        </p>
        <div style={{ marginTop: 'var(--space-2)' }}>
          <HelpArticleLink docId="usage-and-credits" label="How credits and limits work" />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{ ...CARD, padding: 'var(--space-4)', color: 'var(--text-2)', fontSize: 13 }}
        >
          {error}
        </div>
      )}

      <section aria-labelledby="usage-limits-heading" style={CARD}>
        <div style={CARD_HEADER}>
          <h2 id="usage-limits-heading" style={CARD_TITLE}>
            Plan usage limits
          </h2>
          {planAllowanceLine && <p style={CARD_NOTE}>{planAllowanceLine}</p>}
        </div>

        <div style={CARD_BODY}>
          {contractPriced ? (
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
              {showFlagship && (
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
              )}
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
              <RunningResponsesRow reading={limits.data?.responses ?? null} />
              {isFreePlan && (
                <SettingsPageLink href="/pricing" className={`${PRIMARY_BUTTON_CLASS} self-start`}>
                  Upgrade
                </SettingsPageLink>
              )}
            </>
          )}
        </div>

        <div
          style={{
            ...ROW,
            alignItems: 'center',
            padding: 'var(--space-3) var(--space-5)',
            borderTop: '1px solid var(--settings-border)',
          }}
        >
          <span style={DETAIL}>Last updated: {lastUpdatedLabel}</span>
          <button
            type="button"
            onClick={() => {
              void refresh();
              limits.reload();
            }}
            disabled={loading}
            aria-label="Refresh usage data"
            className={QUIET_BUTTON_CLASS}
          >
            <RefreshCw size={12} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </section>

      {credits && !contractPriced && <CreditBalancesCard credits={credits} />}

      <MonthlyAllowancesCard resource={limits} />

      <UsageHistorySection enabled={usage !== null && !contractPriced && !isFreePlan} />
    </div>
  );
}
