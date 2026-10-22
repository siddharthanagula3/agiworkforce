'use client';

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  Progress,
  SegmentedControl,
  Spinner,
  translateUiPlural,
  useConfirmAction,
} from '@agiworkforce/ui';
import { getUsageUrgency } from '@agiworkforce/unified-chat';
import {
  estimateVoiceMinutes,
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
import type { PersonalSpendLimitResponse } from '@/app/api/settings/spend-limit/route';
import { AutoReloadSettingsSchema } from '@/features/billing/lib/billing-account-types';
import { usageWorkloadLabel } from '@/lib/billing/usage-attribution';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useManagedUsageSummary } from '@/lib/hooks/useManagedUsageSummary';
import { toUserMessage } from '@/lib/user-error-message';
import { SettingsPageLink, SettingsSectionLink } from '../components/SettingsSectionLink';
import { HelpArticleLink } from '@/features/support/components/HelpArticleLink';
import { useSettingsModal } from '@/features/settings/components/SettingsModalProvider';
import { openUpgrade } from '@shared/lib/app-commands';

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
const SPEND_LIMIT_URL = '/api/settings/spend-limit';
const SPEND_LIMIT_FAILURE = 'Could not load your monthly spend limit.';
const AUTO_RELOAD_URL = '/api/billing/auto-reload';
const AUTO_RELOAD_FAILURE = 'Could not load auto-reload.';

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
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-2)',
  margin: 0,
};
const CARD_NOTE: CSSProperties = {
  fontSize: 14,
  color: 'var(--text-3)',
  margin: 'var(--space-1) 0 0',
};
const DETAIL: CSSProperties = { fontSize: 14, color: 'var(--text-3)' };
const CRITICAL_DETAIL: CSSProperties = { fontSize: 14, color: 'var(--chat-destructive-text)' };
const STATUS_LINE: CSSProperties = {
  fontSize: 18,
  fontWeight: 500,
  color: 'var(--text-1)',
  margin: 0,
};
const ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
};

const QUIET_BUTTON_CLASS =
  'inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[var(--settings-border)] px-2.5 text-sm font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50 pointer-coarse:min-h-11';
const PRIMARY_BUTTON_CLASS =
  'inline-flex min-h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 pointer-coarse:min-h-11';
const FIELD_CLASS =
  'w-full rounded-md border border-[var(--settings-border)] bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:opacity-60';

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

function formatResetMoment(value: string, nowMs: number): string {
  const at = new Date(value);
  const sameDay = at.toDateString() === new Date(nowMs).toDateString();
  return at.toLocaleString(
    undefined,
    sameDay
      ? { hour: 'numeric', minute: '2-digit' }
      : { weekday: 'short', hour: 'numeric', minute: '2-digit' },
  );
}

type UsageStatus = 'none' | 'on-track' | 'close' | 'limit';

const USAGE_STATUS_COPY: Record<UsageStatus, string> = {
  none: 'No usage yet. Your full limits are available.',
  'on-track': 'On track. You should reach the next reset with room to spare.',
  close: 'Getting close. Some limits are nearly used up.',
  limit: 'Limit reached. Use credits or wait for the reset below.',
};

function usageStatus(percents: readonly number[]): UsageStatus {
  const highest = Math.max(...percents);
  if (highest >= 100) return 'limit';
  if (highest >= 90) return 'close';
  if (highest <= 0) return 'none';
  return 'on-track';
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
      <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{message}</span>
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

const PERIOD_NOT_RENEWED_DETAIL =
  'Your billing period ended and has not renewed yet, so there are no credits to use. Check Billing.';

function UsageBar({
  label,
  percent,
  detail,
  unknown = false,
  unknownDetail = 'Could not read your usage. Retry to load it.',
}: {
  label: string;
  percent: number;
  detail: string;
  unknown?: boolean;
  unknownDetail?: string;
}) {
  const urgency = getUsageUrgency(percent);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={ROW}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>{label}</span>
        <span style={urgency === 'critical' && !unknown ? CRITICAL_DETAIL : DETAIL}>
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
              : 'bg-[var(--chat-text-primary)]'
        }
        style={{ background: 'var(--chat-border-strong)' }}
      />
      <span style={DETAIL}>{unknown ? unknownDetail : detail}</span>
    </div>
  );
}

function usageDetail(
  percentRemaining: number,
  resetAt: string | null,
  nowMs: number,
  window?: ManagedUsageCreditWindow | null,
): string {
  if (percentRemaining <= 0 && resetAt) return `Resets at ${formatResetMoment(resetAt, nowMs)}`;
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
        <dt style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>{label}</dt>
        <dd style={{ fontSize: 14, color: 'var(--text-1)', margin: 0 }}>{value}</dd>
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
        <div style={{ ...ROW, alignItems: 'center' }}>
          <h2 id="usage-balances-heading" style={CARD_TITLE}>
            Credit balances
          </h2>
          <SettingsSectionLink
            section="billing"
            className={`${QUIET_BUTTON_CLASS} rounded-full`}
            style={{ border: '1px solid var(--settings-border)', padding: '0 var(--space-3)' }}
          >
            Buy credits
          </SettingsSectionLink>
        </div>
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

type PersonalSpendState = PersonalSpendLimitResponse['state'];

function parsePersonalSpendState(value: unknown): PersonalSpendState | null {
  if (!isRecord(value) || !isRecord(value['state'])) return null;
  const state = value['state'];
  const cap = state['monthlyCapCredits'];
  const remaining = state['remainingCredits'];
  if (
    typeof state['configured'] !== 'boolean' ||
    typeof state['spentCredits'] !== 'number' ||
    typeof state['overCap'] !== 'boolean' ||
    typeof state['resetsAt'] !== 'string' ||
    (cap !== null && typeof cap !== 'number') ||
    (remaining !== null && typeof remaining !== 'number')
  ) {
    return null;
  }
  return {
    configured: state['configured'],
    monthlyCapCredits: cap,
    spentCredits: state['spentCredits'],
    remainingCredits: remaining,
    overCap: state['overCap'],
    resetsAt: state['resetsAt'],
  };
}

function parseAutoReloadEnabled(value: unknown): { enabled: boolean } | null {
  const parsed = AutoReloadSettingsSchema.safeParse(value);
  return parsed.success ? { enabled: parsed.data.enabled } : null;
}

function spendLimitSummary(state: PersonalSpendState): string {
  if (!state.configured || state.monthlyCapCredits === null) return 'No limit set';
  return `${formatCreditAmount(state.spentCredits)} of ${formatCreditAmount(state.monthlyCapCredits)} used this month`;
}

function SpendLimitEditor({
  state,
  onSaved,
  onCancel,
}: {
  state: PersonalSpendState;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(
    state.monthlyCapCredits === null ? '' : String(state.monthlyCapCredits),
  );
  const [pending, setPending] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const credits = Number(value);
  const valid = value.trim() !== '' && Number.isInteger(credits) && credits >= 1;

  const send = async (method: 'PUT' | 'DELETE') => {
    setPending(method === 'PUT' ? 'save' : 'remove');
    setError(null);
    try {
      const response = await fetch(SPEND_LIMIT_URL, {
        method,
        credentials: 'include',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        ...(method === 'PUT' ? { body: JSON.stringify({ monthlyCapCredits: credits }) } : {}),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const reason =
          isRecord(payload) && isRecord(payload['error']) ? payload['error']['message'] : null;
        throw new Error(typeof reason === 'string' ? reason : 'Your limit was not saved.');
      }
      onSaved();
    } catch (sendError) {
      setError(toUserMessage(sendError, 'Your limit was not saved.'));
      setPending(null);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) {
      setError('Enter a whole number of credits, 1 or more.');
      return;
    }
    void send('PUT');
  };

  const confirmRemove = () =>
    confirm({
      title: 'Remove your monthly limit?',
      description:
        state.monthlyCapCredits === null
          ? 'Credits past your plan limits will no longer stop at a monthly cap. You can set a new limit any time.'
          : `Credits past your plan limits will no longer stop at ${state.monthlyCapCredits.toLocaleString('en-US')} credits a month. You can set a new limit any time.`,
      confirmLabel: 'Remove limit',
      destructive: true,
      onConfirm: () => send('DELETE'),
    });

  return (
    <>
      <form
        onSubmit={submit}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
      >
        <label
          htmlFor="usage-spend-limit-input"
          style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}
        >
          Monthly limit in credits
        </label>
        <input
          id="usage-spend-limit-input"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={pending !== null}
          aria-invalid={error !== null}
          aria-describedby={error ? 'usage-spend-limit-error' : undefined}
          className={`${FIELD_CLASS} max-w-xs`}
        />
        {error && (
          <p id="usage-spend-limit-error" role="alert" style={{ ...CRITICAL_DETAIL, margin: 0 }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <button type="submit" disabled={pending !== null} className={PRIMARY_BUTTON_CLASS}>
            {pending === 'save' ? 'Saving…' : 'Save limit'}
          </button>
          {state.configured && (
            <button
              type="button"
              disabled={pending !== null}
              onClick={confirmRemove}
              className={QUIET_BUTTON_CLASS}
            >
              {pending === 'remove' ? 'Removing…' : 'Remove limit'}
            </button>
          )}
          <button
            type="button"
            disabled={pending !== null}
            onClick={onCancel}
            className={QUIET_BUTTON_CLASS}
          >
            Cancel
          </button>
        </div>
      </form>
      {confirmDialog}
    </>
  );
}

function MonthlySpendLimitCard() {
  const limit = useUsageResource(SPEND_LIMIT_URL, parsePersonalSpendState, SPEND_LIMIT_FAILURE);
  const autoReload = useUsageResource(AUTO_RELOAD_URL, parseAutoReloadEnabled, AUTO_RELOAD_FAILURE);
  const [editing, setEditing] = useState(false);
  const state = limit.data;

  const autoReloadLabel = autoReload.data
    ? autoReload.data.enabled
      ? 'Auto-reload on'
      : 'Auto-reload off'
    : 'Auto-reload settings';

  return (
    <section aria-labelledby="usage-spend-limit-heading" style={CARD}>
      <div style={CARD_HEADER}>
        <div style={{ ...ROW, alignItems: 'center' }}>
          <h2 id="usage-spend-limit-heading" style={CARD_TITLE}>
            Monthly spend limit
          </h2>
          {state && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={`${QUIET_BUTTON_CLASS} rounded-full`}
              style={{ padding: '0 var(--space-3)' }}
            >
              Manage
            </button>
          )}
        </div>
        <p style={CARD_NOTE}>Caps the credits used past your plan limits each month.</p>
      </div>
      <div style={CARD_BODY}>
        {limit.error ? (
          <RetryNotice message={limit.error} onRetry={limit.reload} />
        ) : !state ? (
          <LoadingNotice label="Loading spend limit…" />
        ) : editing ? (
          <SpendLimitEditor
            state={state}
            onSaved={() => {
              setEditing(false);
              limit.reload();
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <p data-testid="usage-spend-limit-status" style={{ ...DETAIL, margin: 0 }}>
              {`${spendLimitSummary(state)} · `}
              <SettingsSectionLink
                section="billing"
                className="text-[var(--text-2)] underline underline-offset-4"
              >
                {autoReloadLabel}
              </SettingsSectionLink>
            </p>
            {state.overCap && (
              <p style={{ ...CRITICAL_DETAIL, margin: 0 }}>
                {`Limit reached. Credits past your plan limits resume ${formatUtcDate(state.resetsAt)}.`}
              </p>
            )}
          </div>
        )}
      </div>
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
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>{copy.label}</span>
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

function VoiceEstimateRow({
  credits,
  minuteCredits,
}: {
  credits: AccountCredits | null;
  minuteCredits: number | null;
}) {
  if (!credits) return null;
  const minutes = estimateVoiceMinutes(
    [credits.five_hour.remaining, credits.weekly.remaining, credits.monthly.remaining],
    minuteCredits,
  );
  if (minutes === null) return null;
  return (
    <div style={ROW} data-testid="usage-voice-estimate">
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>Voice</span>
      <span style={DETAIL}>
        {minutes > 0
          ? `About ${formatCount(minutes, 'counts.usageMinutes', 'minute', 'minutes')} of voice left at today's price`
          : 'No voice left until a limit above resets'}
      </span>
    </div>
  );
}

function RunningResponsesRow({ reading }: { reading: AccountUsageLimitsResponse['responses'] }) {
  if (!reading) return null;
  return (
    <div style={ROW}>
      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>
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
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>
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
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>
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
        <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
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
            className="text-sm text-primary underline underline-offset-4"
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
        <span className="text-sm font-medium text-foreground">Period</span>
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
        <span className="text-sm font-medium text-foreground">Request ID (optional)</span>
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
        <span className="text-sm font-medium text-foreground">
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
        <span className="text-sm font-medium text-foreground">What looks wrong</span>
        <textarea
          className={`${FIELD_CLASS} resize-y`}
          rows={4}
          value={message}
          disabled={submitting}
          onChange={(event) => setMessage(event.target.value)}
        />
      </label>
      {error && (
        <span role="alert" style={{ fontSize: 14, color: 'var(--chat-destructive-text)' }}>
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
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
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
  const { closeSettings } = useSettingsModal();

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);

  const usageUnknown = !usage;
  const periodLapsed =
    usage?.usage_allocation === 'pending' &&
    Boolean(usage.period_end) &&
    Date.parse(usage.period_end ?? '') <= nowMs;
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
    usage !== null && !contractPriced && !isFreePlan ? '/api/usage/limits' : null,
    parseAccountUsageLimitsResponse,
    LIMITS_FAILURE,
  );

  const statusLine =
    usageUnknown || periodLapsed
      ? null
      : USAGE_STATUS_COPY[
          usageStatus([
            sessionUsedPercent,
            weeklyUsedPercent,
            usedPercent,
            ...(showFlagship ? [flagshipWeeklyUsedPercent] : []),
          ])
        ];

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
          <HelpArticleLink docId="usage-and-credits" label="Learn more about usage limits" />
        </div>
        {!isFreePlan && (
          <div style={{ marginTop: 'var(--space-2)' }}>
            <SettingsSectionLink
              section="billing"
              className="text-primary underline underline-offset-4"
            >
              Billing history
            </SettingsSectionLink>
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{ ...CARD, padding: 'var(--space-4)', color: 'var(--text-2)', fontSize: 14 }}
        >
          {error}
        </div>
      )}

      <section aria-labelledby="usage-limits-heading" style={CARD}>
        <div style={CARD_HEADER}>
          <h2 id="usage-limits-heading" style={CARD_TITLE}>
            {isFreePlan ? 'Upgrade for higher capacity' : 'Plan usage limits'}
          </h2>
          {!isFreePlan && planAllowanceLine && <p style={CARD_NOTE}>{planAllowanceLine}</p>}
        </div>

        <div style={CARD_BODY}>
          {isFreePlan ? (
            <button
              type="button"
              className={`${PRIMARY_BUTTON_CLASS} self-start`}
              onClick={() => {
                closeSettings();
                openUpgrade((href) => window.location.assign(href));
              }}
            >
              Upgrade
            </button>
          ) : contractPriced ? (
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
              {statusLine && (
                <p data-testid="usage-status" style={STATUS_LINE}>
                  {statusLine}
                </p>
              )}
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
                unknown={usageUnknown || periodLapsed}
                {...(periodLapsed ? { unknownDetail: PERIOD_NOT_RENEWED_DETAIL } : {})}
                label={managedUsageBucketLabel('period')}
                percent={usedPercent}
                detail={usageDetail(
                  100 - usedPercent,
                  usage?.usage_reset_at ?? null,
                  nowMs,
                  credits?.monthly,
                )}
              />
              <VoiceEstimateRow
                credits={credits}
                minuteCredits={limits.data?.voiceMinuteCredits ?? null}
              />
              <RunningResponsesRow reading={limits.data?.responses ?? null} />
            </>
          )}
        </div>

        {!isFreePlan && (
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
        )}
      </section>

      {credits && !contractPriced && !isFreePlan && <CreditBalancesCard credits={credits} />}

      {usage !== null && !contractPriced && !isFreePlan && <MonthlySpendLimitCard />}

      {!isFreePlan && <MonthlyAllowancesCard resource={limits} />}

      <UsageHistorySection enabled={usage !== null && !contractPriced && !isFreePlan} />
    </div>
  );
}
