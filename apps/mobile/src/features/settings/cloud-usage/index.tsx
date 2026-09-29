import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  MONTHLY_METERED_UNIT_COPY,
  formatCreditWindowUsage,
  formatCredits,
  formatPlanCreditAllowanceLine,
  getModelMetadataById,
  managedUsageBucketLabel,
  usageWorkloadLabel,
  type AccountUsageAllowances,
  type AccountUsageHistoryGranularity,
  type AccountUsageHistoryRow,
  type AccountUsageHistorySummary,
  type ManagedUsageCreditWindow,
  type ManagedUsageCredits,
} from '@agiworkforce/types';
import { View, ActivityIndicator } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useRouter } from 'expo-router';
import { BarChart3, RefreshCw } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  CloudAccountRequired,
  CloudSyncBlockedBanner,
  SettingsInfo,
  SettingsScreenShell,
} from '@/src/features/settings/common';
import { useCloudUsageStore } from './store';
import { fetchUsageAllowances, fetchUsageHistory } from '@/services/usage';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { getBillingPlanPricing } from '@agiworkforce/types';
import { formatBytes } from '@agiworkforce/utils/format';
import { useAuthStore } from '@/src/features/auth/store';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';

function formatResetDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

function formatResetWeekday(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function formatResetsInDuration(iso: string | null): string | null {
  if (!iso) return null;
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return null;
  const msRemaining = target - Date.now();
  if (msRemaining <= 0) return null;
  const totalMinutes = Math.round(msRemaining / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours} hr ${minutes} min`;
}

function UsagePercentBar({
  label,
  percentage,
  resetLabel,
  credits,
}: {
  label: string;
  percentage: number;
  resetLabel: string | null;
  credits?: ManagedUsageCreditWindow | null;
}) {
  const colors = useThemeColors();
  const clamped = Math.min(100, Math.max(0, percentage));
  const isNearLimit = clamped >= 90;

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
        {label}
      </Text>
      <View
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.progressTrack,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: 8,
            borderRadius: 4,
            backgroundColor: isNearLimit ? colors.agentError : colors.teal,
            width: `${clamped}%`,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
          {credits
            ? formatCreditWindowUsage(credits.used, credits.allowance)
            : `${Math.round(clamped)}% used`}
        </Text>
        {resetLabel && (
          <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
            Resets {resetLabel}
          </Text>
        )}
      </View>
    </View>
  );
}

const HISTORY_OPTIONS: ReadonlyArray<{ value: AccountUsageHistoryGranularity; label: string }> = [
  { value: 'day', label: 'Days' },
  { value: 'week', label: 'Weeks' },
  { value: 'month', label: 'Months' },
];

const HISTORY_UNIT: Record<AccountUsageHistoryGranularity, string> = {
  day: 'UTC day',
  week: 'UTC week, Monday to Sunday',
  month: 'UTC calendar month',
};

const HISTORY_CAPTION: Record<AccountUsageHistoryGranularity, string> = {
  day: 'By day',
  week: 'By week',
  month: 'By month',
};

const HISTORY_ROW_LIMIT = 8;

function formatCreditAmount(value: number): string {
  return formatCredits(value, { maximumFractionDigits: value > 0 && value < 10 ? 2 : 1 });
}

function formatCount(value: number, one: string, many: string): string {
  return `${value.toLocaleString()} ${value === 1 ? one : many}`;
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatHistoryPeriod(start: string, granularity: AccountUsageHistoryGranularity): string {
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

interface UsageResource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function useUsageResource<T>(
  key: string | null,
  load: () => Promise<T>,
  failure: string,
): UsageResource<T> {
  const [state, setState] = useState<{
    key: string | null;
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({ key: null, data: null, loading: false, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (key === null) return undefined;
    let active = true;
    setState((current) => ({
      key,
      data: current.key === key ? current.data : null,
      loading: true,
      error: null,
    }));
    load()
      .then((data) => {
        if (active) setState({ key, data, loading: false, error: null });
      })
      .catch(() => {
        if (active) setState((current) => ({ ...current, key, loading: false, error: failure }));
      });
    return () => {
      active = false;
    };
  }, [key, load, failure, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  const current = state.key === key;
  return {
    data: current ? state.data : null,
    loading: current && state.loading,
    error: current ? state.error : null,
    reload,
  };
}

function SectionCard({
  title,
  note,
  children,
}: {
  title: string;
  note?: string | null;
  children: ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        borderRadius: 14,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
        marginBottom: 18,
      }}
    >
      <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4 }}>
        <Text
          accessibilityRole="header"
          style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
        >
          {title}
        </Text>
        {note ? (
          <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>{note}</Text>
        ) : null}
      </View>
      <View style={{ padding: 16, gap: 14 }}>{children}</View>
    </View>
  );
}

function DetailRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const colors = useThemeColors();
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: typeScale.subhead,
            fontWeight: '500',
            flexShrink: 1,
          }}
        >
          {label}
        </Text>
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.subhead }}>{value}</Text>
      </View>
      {detail ? (
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption }}>{detail}</Text>
      ) : null}
    </View>
  );
}

function ResourceStatus({
  resource,
  loadingLabel,
}: {
  resource: UsageResource<unknown>;
  loadingLabel: string;
}) {
  const colors = useThemeColors();
  if (resource.loading) {
    return <ActivityIndicator accessibilityLabel={loadingLabel} color={colors.teal} />;
  }
  if (!resource.error) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
        {resource.error}
      </Text>
      <Pressable
        onPress={resource.reload}
        accessibilityRole="button"
        accessibilityLabel="Retry"
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <Text
          style={{ color: colors.textPrimary, fontSize: typeScale.footnote, fontWeight: '600' }}
        >
          Retry
        </Text>
      </Pressable>
    </View>
  );
}

function bonusRow(bonus: ManagedUsageCredits['bonus']): { value: string; detail: string } | null {
  if (bonus === undefined) return null;
  if (bonus === null) {
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
      ? `Next expiry ${formatLongDate(bonus.next_expiry_at)}`
      : 'No expiry date recorded.',
  };
}

function purchasedRow(credits: ManagedUsageCredits): { value: string; detail: string } {
  const remaining = credits.purchased.remaining;
  if (remaining === null) {
    return {
      value: 'Unavailable',
      detail: 'Could not read your purchased credits. Refresh to retry.',
    };
  }
  const expiry = credits.purchase_expiry;
  return {
    value: remaining > 0 ? formatCreditAmount(remaining) : 'None',
    detail:
      expiry && expiry.expiring_credits > 0 && expiry.next_expiry_at
        ? `${formatCreditAmount(expiry.expiring_credits)} expire as local law requires where they were bought, the next on ${formatLongDate(expiry.next_expiry_at)}. The rest don't expire.`
        : "Purchased credits don't expire.",
  };
}

function CreditBalancesCard({ credits }: { credits: ManagedUsageCredits }) {
  const bonus = bonusRow(credits.bonus);
  const purchased = purchasedRow(credits);
  return (
    <SectionCard
      title="Credit balances"
      note="Once a plan limit is reached, bonus credits are used first, soonest to expire, then purchased credits."
    >
      <DetailRow
        label="Included in your plan"
        value={`${formatCreditAmount(credits.monthly.remaining)} left`}
        detail={`Of ${formatCreditAmount(credits.monthly.allowance)} this month`}
      />
      {bonus ? <DetailRow label="Bonus credits" value={bonus.value} detail={bonus.detail} /> : null}
      <DetailRow label="Purchased credits" value={purchased.value} detail={purchased.detail} />
    </SectionCard>
  );
}

function AllowancesCard({ resource }: { resource: UsageResource<AccountUsageAllowances> }) {
  const allowances = resource.data;
  const units =
    allowances?.units.filter((unit) => unit.hardLimit !== null || unit.consumed > 0) ?? [];
  const showImages = (allowances?.images.requests ?? 0) > 0;
  if (
    allowances &&
    units.length === 0 &&
    !showImages &&
    allowances.responses === null &&
    !resource.loading &&
    !resource.error
  ) {
    return null;
  }
  return (
    <SectionCard
      title="This month"
      note={allowances ? `Resets ${formatLongDate(allowances.resetAt)}` : null}
    >
      <ResourceStatus resource={resource} loadingLabel="Loading this month's usage" />
      {allowances && !resource.loading && !resource.error ? (
        <>
          {units.map((unit) => {
            const copy = MONTHLY_METERED_UNIT_COPY[unit.unit];
            return (
              <DetailRow
                key={unit.unit}
                label={copy.label}
                value={
                  unit.hardLimit === null
                    ? `${formatCount(unit.consumed, copy.one, copy.many)}, no monthly cap`
                    : `${unit.consumed.toLocaleString()} of ${formatCount(unit.hardLimit, copy.one, copy.many)}`
                }
              />
            );
          })}
          {showImages ? (
            <DetailRow
              label="Images"
              value={`${formatCount(allowances.images.images, 'image', 'images')} · ${formatCreditAmount(allowances.images.credits)}`}
            />
          ) : null}
          {allowances.responses ? (
            <DetailRow
              label="Responses running now"
              value={`${allowances.responses.active} of ${allowances.responses.limit} at a time`}
            />
          ) : null}
        </>
      ) : null}
    </SectionCard>
  );
}

function StorageCard({ resource }: { resource: UsageResource<AccountUsageAllowances> }) {
  const storage = resource.data?.storage ?? null;
  if (!storage || storage.usedBytes === null || resource.loading || resource.error) return null;
  return (
    <SectionCard
      title="File storage"
      note="Uploaded and generated files and project sources count toward this."
    >
      <DetailRow
        label="Used"
        value={
          storage.limitBytes === null
            ? formatBytes(storage.usedBytes, 1)
            : `${formatBytes(storage.usedBytes, 1)} of ${formatBytes(storage.limitBytes, 1)}`
        }
      />
    </SectionCard>
  );
}

function HistoryRows({
  caption,
  rows,
  labelFor,
}: {
  caption: string;
  rows: readonly AccountUsageHistoryRow[];
  labelFor: (row: AccountUsageHistoryRow) => string;
}) {
  const colors = useThemeColors();
  if (rows.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption, fontWeight: '600' }}>
        {caption}
      </Text>
      {rows.slice(0, HISTORY_ROW_LIMIT).map((row) => (
        <View
          key={row.key}
          style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote, flexShrink: 1 }}>
            {labelFor(row)}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
            {`${formatCount(row.requests, 'request', 'requests')} · ${formatCreditAmount(row.credits)}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

function UsageHistoryCard({ accountKey }: { accountKey: string }) {
  const colors = useThemeColors();
  const [granularity, setGranularity] = useState<AccountUsageHistoryGranularity>('day');
  const load = useCallback(() => fetchUsageHistory(granularity), [granularity]);
  const resource = useUsageResource<AccountUsageHistorySummary>(
    `${accountKey}:${granularity}`,
    load,
    'Could not load your usage history.',
  );
  const history = resource.loading || resource.error ? null : resource.data;
  const periods =
    history?.periods
      .slice()
      .reverse()
      .map((period) => ({
        key: period.start,
        label: null,
        requests: period.requests,
        credits: period.credits,
      })) ?? [];

  return (
    <SectionCard
      title="Where your usage went"
      note={`Settled usage by ${HISTORY_UNIT[granularity]}. Requests still settling are not counted yet.`}
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {HISTORY_OPTIONS.map((option) => {
          const selected = option.value === granularity;
          return (
            <Pressable
              key={option.value}
              onPress={() => setGranularity(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Group usage by ${option.label.toLowerCase()}`}
              style={{
                minHeight: 44,
                paddingHorizontal: 14,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: selected ? colors.textPrimary : colors.border,
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.footnote,
                  fontWeight: selected ? '600' : '400',
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <ResourceStatus resource={resource} loadingLabel="Loading usage history" />
      {history && history.totals.requests === 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
          No settled usage in this period.
        </Text>
      ) : null}
      {history && history.totals.requests > 0 ? (
        <>
          <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
            {`${formatCount(history.totals.requests, 'request', 'requests')} · ${formatCreditAmount(history.totals.credits)}`}
          </Text>
          <HistoryRows
            caption={HISTORY_CAPTION[history.granularity]}
            rows={periods}
            labelFor={(row) => formatHistoryPeriod(row.key, history.granularity)}
          />
          <HistoryRows
            caption="By product area"
            rows={history.byWorkload}
            labelFor={(row) => usageWorkloadLabel(row.key)}
          />
          <HistoryRows
            caption="By model"
            rows={history.byModel}
            labelFor={(row) => row.label ?? getModelMetadataById(row.key)?.name ?? row.key}
          />
          {history.unsettledRequests > 0 ? (
            <Text
              accessibilityRole="text"
              style={{ color: colors.textSecondary, fontSize: typeScale.caption }}
            >
              {`${formatCount(history.unsettledRequests, 'request is', 'requests are')} still settling and not counted above.`}
            </Text>
          ) : null}
        </>
      ) : null}
    </SectionCard>
  );
}

export default function CloudUsageScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const isCloudModeActive = appMode === 'cloud';

  const ownerId = useCloudUsageStore((s) => s.ownerId);
  const cachedSnapshot = useCloudUsageStore((s) => s.snapshot);
  const loading = useCloudUsageStore((s) => s.loading);
  const error = useCloudUsageStore((s) => s.error);
  const updatedAt = useCloudUsageStore((s) => s.updatedAt);
  const load = useCloudUsageStore((s) => s.refresh);
  const snapshot = ownerId === clerkUserId ? cachedSnapshot : null;
  const lastUpdated =
    ownerId === clerkUserId && updatedAt !== null
      ? new Date(updatedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : null;

  useEffect(() => {
    if (isClerkSignedIn && isCloudModeActive) void load();
  }, [clerkUserId, load, isClerkSignedIn, isCloudModeActive]);

  const handleSignIn = useCallback(() => {
    router.push(beginCloudPostAuthIntent('cloud-usage'));
  }, [router]);

  const accountKey = isClerkSignedIn && isCloudModeActive && clerkUserId ? clerkUserId : null;
  const allowances = useUsageResource<AccountUsageAllowances>(
    accountKey,
    fetchUsageAllowances,
    'Could not load this month’s usage.',
  );

  const planLabel = snapshot ? getBillingPlanPricing(snapshot.planTier).label : '';
  const periodResetLabel = snapshot ? formatResetDate(snapshot.usageResetAt) : null;
  const planAllowanceLine = snapshot?.credits
    ? formatPlanCreditAllowanceLine(planLabel, {
        monthly: snapshot.credits.monthly.allowance,
        weekly: snapshot.credits.weekly.allowance,
        fiveHour: snapshot.credits.five_hour.allowance,
      })
    : null;

  if (!isClerkLoaded || !isClerkSignedIn) {
    return (
      <SettingsScreenShell title="Usage">
        <CloudAccountRequired isLoading={!isClerkLoaded} onSignIn={handleSignIn} />
      </SettingsScreenShell>
    );
  }

  return (
    <SettingsScreenShell title="Usage">
      <SettingsInfo
        title="Plan usage"
        body="See how much of your plan's included usage you've used this period."
        icon={BarChart3}
      />

      {!isCloudModeActive && <CloudSyncBlockedBanner onSwitchToCloud={() => setAppMode('cloud')} />}

      {/* Live usage */}
      {isCloudModeActive && (
        <>
          {loading && !snapshot && (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <ActivityIndicator size="large" color={colors.teal} />
            </View>
          )}

          {error && (
            <View
              style={{
                borderRadius: 12,
                backgroundColor: colors.dangerSurface,
                borderWidth: 1,
                borderColor: colors.dangerBorder,
                padding: 12,
                marginBottom: 18,
              }}
            >
              <Text style={{ color: colors.agentError, fontSize: typeScale.footnote }}>
                {error}
              </Text>
              <Pressable
                onPress={() => void load()}
                disabled={loading}
                accessibilityLabel="Retry loading usage"
                accessibilityRole="button"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 10,
                  minHeight: 32,
                }}
              >
                <RefreshCw size={14} color={colors.agentError} />
                <Text
                  style={{
                    color: colors.agentError,
                    fontSize: typeScale.footnote,
                    fontWeight: '600',
                  }}
                >
                  {loading ? 'Retrying…' : 'Retry'}
                </Text>
              </Pressable>
            </View>
          )}

          {snapshot && (
            <>
              {/* Current session, rolling 5h window, layers on top of the
                  monthly budget (founder decision, 2026-07-05). Percentage-only
                  contract: a null reset means the window is inactive for this
                  tier (e.g. free) or unused, so hide the section entirely. */}
              {snapshot.sessionResetAt !== null && (
                <View
                  style={{
                    borderRadius: 14,
                    backgroundColor: colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 16,
                    marginBottom: 18,
                  }}
                >
                  <UsagePercentBar
                    label={managedUsageBucketLabel('session')}
                    percentage={snapshot.sessionUsagePercentage}
                    resetLabel={
                      formatResetsInDuration(snapshot.sessionResetAt) === null
                        ? null
                        : `in ${formatResetsInDuration(snapshot.sessionResetAt)}`
                    }
                    credits={snapshot.credits?.five_hour}
                  />
                </View>
              )}

              {/* Weekly limits, "All models" + flagship-only sub-bucket,
                  both rolling 7-day windows. Same layering rationale as session. */}
              {snapshot.weeklyResetAt !== null && (
                <>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: typeScale.footnote,
                      fontWeight: '600',
                      marginBottom: 8,
                    }}
                  >
                    Weekly limits
                  </Text>
                  <View
                    style={{
                      borderRadius: 14,
                      backgroundColor: colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: colors.border,
                      overflow: 'hidden',
                      marginBottom: 18,
                    }}
                  >
                    <View style={{ padding: 16 }}>
                      <UsagePercentBar
                        label={managedUsageBucketLabel('weekly')}
                        percentage={snapshot.weeklyUsagePercentage}
                        resetLabel={formatResetWeekday(snapshot.weeklyResetAt)}
                        credits={snapshot.credits?.weekly}
                      />
                    </View>
                    {snapshot.flagshipWeeklyResetAt !== null && (
                      <View
                        style={{
                          padding: 16,
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                        }}
                      >
                        <UsagePercentBar
                          label={managedUsageBucketLabel('weeklyFlagship')}
                          percentage={snapshot.flagshipWeeklyUsagePercentage}
                          resetLabel={formatResetWeekday(snapshot.flagshipWeeklyResetAt)}
                          credits={snapshot.credits?.flagship_weekly}
                        />
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* Primary card, percentage only, Claude-style */}
              <View
                style={{
                  borderRadius: 14,
                  backgroundColor: colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: colors.border,
                  overflow: 'hidden',
                  marginBottom: 18,
                }}
              >
                <View
                  style={{
                    padding: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontSize: typeScale.caption,
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {planLabel} plan
                  </Text>
                  {lastUpdated && (
                    <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                      Updated {lastUpdated}
                    </Text>
                  )}
                </View>

                {planAllowanceLine && (
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: typeScale.caption,
                      paddingHorizontal: 14,
                      paddingTop: 10,
                    }}
                  >
                    {planAllowanceLine}
                  </Text>
                )}

                <View style={{ padding: 16, gap: 20 }}>
                  <UsagePercentBar
                    label={managedUsageBucketLabel('period')}
                    percentage={snapshot.usagePercentage}
                    resetLabel={periodResetLabel}
                    credits={snapshot.credits?.monthly}
                  />
                </View>

                {/* Footer, refresh */}
                <View
                  style={{
                    padding: 12,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                  }}
                >
                  {/*
                    No `style` prop on Pressable, its function-style
                    `style={({pressed}) => ({...})}` callback silently drops
                    layout properties (flexDirection/alignItems/padding) in
                    this stack (nativewind 4.2.3 + react-native-css-interop
                    0.2.3), which stacked the icon above "Refresh" instead of
                    beside it. Same class as MOBILE-PRESSABLE-CSSINTEROP-FLEXDIR-01
                    (audit/registers/known-flaws.md), using `children` as a
                    function instead routes pressed state through a plain
                    object-literal-style View, which renders correctly.
                  */}
                  <Pressable
                    onPress={() => void load()}
                    disabled={loading}
                    accessibilityLabel="Refresh usage"
                    accessibilityRole="button"
                  >
                    {({ pressed }) => (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                          opacity: loading ? 0.5 : 1,
                        }}
                      >
                        <RefreshCw size={12} color={colors.textMuted} />
                        <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                          Refresh
                        </Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>

              {snapshot.credits ? <CreditBalancesCard credits={snapshot.credits} /> : null}
              <AllowancesCard resource={allowances} />
              <StorageCard resource={allowances} />
              {accountKey ? <UsageHistoryCard accountKey={accountKey} /> : null}
            </>
          )}
        </>
      )}
    </SettingsScreenShell>
  );
}
