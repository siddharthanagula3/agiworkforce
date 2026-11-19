import { useCallback, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Gauge, X } from 'lucide-react-native';
import { USAGE_RESET_REMINDER_MAX_AHEAD_MS } from '@agiworkforce/cloud-contracts';
import {
  normalizeUsagePercentage,
  selectUsageWarning,
  type ManagedUsageBucketReading,
  type ManagedUsageCreditWindow,
  type ManagedUsageWarning,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { ApiHttpError } from '@/services/apiErrors';
import { useAuthStore } from '@/src/features/auth/store';
import {
  requestUsageResetReminder,
  type UsageResetReminderOutcome,
} from '@/src/features/chat/services/usageResetReminder';
import { useCloudUsageStore } from '@/src/features/settings/cloud-usage/store';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { contentColumn } from '@/src/shared/layout/contentColumn';
import type { UsageSnapshot } from '@/services/usage';

function inCredits(window: ManagedUsageCreditWindow | null | undefined) {
  return window ? { allowanceCredits: window.allowance, usedCredits: window.used } : {};
}

export function usageReadingsFromSnapshot(snapshot: UsageSnapshot): ManagedUsageBucketReading[] {
  const credits = snapshot.credits;
  return [
    {
      bucket: 'session',
      percentRemaining: 100 - normalizeUsagePercentage(snapshot.sessionUsagePercentage),
      resetAt: snapshot.sessionResetAt,
      ...inCredits(credits?.five_hour),
    },
    {
      bucket: 'weekly',
      percentRemaining: 100 - normalizeUsagePercentage(snapshot.weeklyUsagePercentage),
      resetAt: snapshot.weeklyResetAt,
      ...inCredits(credits?.weekly),
    },
    {
      bucket: 'weeklyFlagship',
      percentRemaining: 100 - normalizeUsagePercentage(snapshot.flagshipWeeklyUsagePercentage),
      resetAt: snapshot.flagshipWeeklyResetAt,
      ...inCredits(credits?.flagship_weekly),
    },
    {
      bucket: 'period',
      percentRemaining: 100 - normalizeUsagePercentage(snapshot.usagePercentage),
      resetAt: snapshot.usageResetAt,
      ...inCredits(credits?.monthly),
    },
  ];
}

export function usageWarningFromSnapshot(snapshot: UsageSnapshot): ManagedUsageWarning | null {
  return selectUsageWarning(usageReadingsFromSnapshot(snapshot), Date.now(), {
    planTier: snapshot.planTier,
  });
}

export const USAGE_RESET_REMINDER_ACTION = 'Notify me when it resets';
export const USAGE_RESET_REMINDER_SET = 'We’ll notify you';
const USAGE_RESET_REMINDER_FAILED = 'The reminder could not be set. Try again in a minute.';
const USAGE_RESET_REMINDER_REFUSED: Readonly<
  Record<Exclude<UsageResetReminderOutcome, 'set'>, string>
> = {
  blocked: 'Notifications are blocked for this app in Settings.',
  unreachable: 'This device cannot receive notifications right now. Try again in a minute.',
  not_allowed: 'Notifications are not allowed yet. Tap again to be asked.',
};

export function usageResumesAt(snapshot: UsageSnapshot, now: number = Date.now()): string | null {
  const exhausted = usageReadingsFromSnapshot(snapshot).filter(
    (reading) => Number.isFinite(reading.percentRemaining) && reading.percentRemaining <= 0,
  );
  if (exhausted.length === 0) return null;
  let latest = Number.NEGATIVE_INFINITY;
  for (const reading of exhausted) {
    if (reading.resetAt === null || reading.resetAt === undefined) return null;
    const at = new Date(reading.resetAt).getTime();
    if (!Number.isFinite(at)) return null;
    latest = Math.max(latest, at);
  }
  const ahead = latest - now;
  if (ahead <= 0 || ahead > USAGE_RESET_REMINDER_MAX_AHEAD_MS) return null;
  return new Date(latest).toISOString();
}

type ResetReminder =
  | { resetAt: string; state: 'pending' | 'set' }
  | { resetAt: string; state: 'error'; message: string };

const USER_SAFE_REFUSAL_STATUSES = new Set([400, 401, 409, 429]);

function reminderFailure(error: unknown): string {
  return error instanceof ApiHttpError &&
    USER_SAFE_REFUSAL_STATUSES.has(error.status) &&
    error.message.trim()
    ? error.message
    : USAGE_RESET_REMINDER_FAILED;
}

function useUsageResetReminder(warning: ManagedUsageWarning | null) {
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const snapshot = useCloudUsageStore((s) =>
    s.ownerId !== null && s.ownerId === clerkUserId ? s.snapshot : null,
  );
  const resetAt = warning && snapshot ? usageResumesAt(snapshot) : null;
  const [reminder, setReminder] = useState<ResetReminder | null>(null);
  const current = reminder && reminder.resetAt === resetAt ? reminder : null;

  const settle = useCallback((next: ResetReminder) => {
    setReminder((previous) => (previous?.resetAt === next.resetAt ? next : previous));
    AccessibilityInfo.announceForAccessibility(
      next.state === 'error' ? next.message : USAGE_RESET_REMINDER_SET,
    );
  }, []);

  const remind = useCallback(async () => {
    if (!resetAt || current?.state === 'pending' || current?.state === 'set') return;
    setReminder({ resetAt, state: 'pending' });
    try {
      const outcome = await requestUsageResetReminder(resetAt);
      settle(
        outcome === 'set'
          ? { resetAt, state: 'set' }
          : { resetAt, state: 'error', message: USAGE_RESET_REMINDER_REFUSED[outcome] },
      );
    } catch (error) {
      settle({ resetAt, state: 'error', message: reminderFailure(error) });
    }
  }, [current?.state, resetAt, settle]);

  return { available: resetAt !== null, reminder: current, remind };
}

export function UsageLimitBanner({
  warning,
  actionLabel,
  onAction,
  onDismiss,
}: {
  warning: ManagedUsageWarning | null;
  actionLabel: string | null;
  onAction: () => void;
  onDismiss: () => void;
}) {
  const colors = useThemeColors();
  const resetReminder = useUsageResetReminder(warning);
  if (!warning) return null;
  const critical = warning.severity === 'critical';
  const reminderState = resetReminder.reminder?.state ?? null;

  return (
    <View testID="chat.usage-limit.column" style={contentColumn('reading')}>
      <View
        testID="chat.usage-limit"
        accessibilityRole="summary"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginHorizontal: 12,
          marginBottom: 8,
          paddingLeft: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: critical ? colors.warningBorder : colors.border,
          backgroundColor: critical ? colors.warningSurface : colors.surfaceElevated,
        }}
      >
        <Gauge size={16} color={critical ? colors.agentWarning : colors.textSecondary} />
        <View style={{ flex: 1, minWidth: 0, paddingVertical: 8 }}>
          <Text
            numberOfLines={2}
            style={{ color: colors.textPrimary, fontSize: typeScale.footnote, fontWeight: '500' }}
          >
            {warning.headline}
          </Text>
          {warning.resetLabel ? (
            <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption }}>
              {warning.resetLabel}
            </Text>
          ) : null}
          {resetReminder.available && reminderState === 'set' ? (
            <Text
              testID="chat.usage-limit.reminder-set"
              style={{ color: colors.textSecondary, fontSize: typeScale.caption }}
            >
              {USAGE_RESET_REMINDER_SET}
            </Text>
          ) : null}
          {resetReminder.available && reminderState !== 'set' ? (
            <PressableBox
              testID="chat.usage-limit.remind"
              onPress={() => void resetReminder.remind()}
              disabled={reminderState === 'pending'}
              accessibilityRole="button"
              accessibilityLabel={USAGE_RESET_REMINDER_ACTION}
              accessibilityState={{
                disabled: reminderState === 'pending',
                busy: reminderState === 'pending',
              }}
              style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
            >
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.footnote,
                  fontWeight: '600',
                  opacity: reminderState === 'pending' ? 0.6 : 1,
                }}
              >
                {USAGE_RESET_REMINDER_ACTION}
              </Text>
            </PressableBox>
          ) : null}
          {resetReminder.reminder?.state === 'error' ? (
            <Text
              testID="chat.usage-limit.reminder-error"
              style={{ color: colors.textPrimary, fontSize: typeScale.caption }}
            >
              {resetReminder.reminder.message}
            </Text>
          ) : null}
        </View>
        {actionLabel ? (
          <PressableBox
            testID="chat.usage-limit.action"
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.footnote, fontWeight: '600' }}
            >
              {actionLabel}
            </Text>
          </PressableBox>
        ) : null}
        <PressableBox
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss usage warning"
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={16} color={colors.textSecondary} />
        </PressableBox>
      </View>
    </View>
  );
}
