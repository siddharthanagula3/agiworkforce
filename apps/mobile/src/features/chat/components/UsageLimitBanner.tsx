import { View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Gauge, X } from 'lucide-react-native';
import {
  normalizeUsagePercentage,
  selectUsageWarning,
  type ManagedUsageBucketReading,
  type ManagedUsageCreditWindow,
  type ManagedUsageWarning,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
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

export interface UsageNotice {
  message: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
}

export function UsageLimitBanner({
  warning,
  actionLabel,
  onAction,
  onDismiss,
  notice = null,
}: {
  warning: ManagedUsageWarning | null;
  actionLabel: string | null;
  onAction: () => void;
  onDismiss: () => void;
  notice?: UsageNotice | null;
}) {
  const colors = useThemeColors();
  if (!warning && !notice) return null;
  const critical = warning?.severity === 'critical';
  const headline = warning ? warning.headline : (notice?.message ?? '');
  const resetLabel = warning ? warning.resetLabel : null;
  const shownActionLabel = warning ? actionLabel : (notice?.actionLabel ?? null);
  const handleAction = warning ? onAction : (notice?.onAction ?? onAction);
  const handleDismiss = warning ? onDismiss : (notice?.onDismiss ?? onDismiss);

  return (
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
          {headline}
        </Text>
        {resetLabel ? (
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption }}>
            {resetLabel}
          </Text>
        ) : null}
      </View>
      {shownActionLabel ? (
        <PressableBox
          testID="chat.usage-limit.action"
          onPress={handleAction}
          accessibilityRole="button"
          accessibilityLabel={shownActionLabel}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.footnote, fontWeight: '600' }}
          >
            {shownActionLabel}
          </Text>
        </PressableBox>
      ) : null}
      <PressableBox
        onPress={handleDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss usage warning"
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <X size={16} color={colors.textSecondary} />
      </PressableBox>
    </View>
  );
}
