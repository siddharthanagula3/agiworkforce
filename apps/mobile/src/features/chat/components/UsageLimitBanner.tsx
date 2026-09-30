import { View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { Gauge, X } from 'lucide-react-native';
import {
  normalizeUsagePercentage,
  selectUsageWarning,
  type ManagedUsageCreditWindow,
  type ManagedUsageWarning,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import type { UsageSnapshot } from '@/services/usage';

function inCredits(window: ManagedUsageCreditWindow | null | undefined) {
  return window ? { allowanceCredits: window.allowance, usedCredits: window.used } : {};
}

export function usageWarningFromSnapshot(snapshot: UsageSnapshot): ManagedUsageWarning | null {
  const credits = snapshot.credits;
  return selectUsageWarning([
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
  ]);
}

export function UsageLimitBanner({
  warning,
  onGetMoreUsage,
  onDismiss,
}: {
  warning: ManagedUsageWarning | null;
  onGetMoreUsage: () => void;
  onDismiss: () => void;
}) {
  const colors = useThemeColors();
  if (!warning) return null;
  const critical = warning.severity === 'critical';

  return (
    <View
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
      </View>
      <PressableBox
        onPress={onGetMoreUsage}
        accessibilityRole="button"
        accessibilityLabel="Get more usage"
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text
          style={{ color: colors.textPrimary, fontSize: typeScale.footnote, fontWeight: '600' }}
        >
          Get more usage
        </Text>
      </PressableBox>
      <PressableBox
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss usage warning"
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <X size={16} color={colors.textSecondary} />
      </PressableBox>
    </View>
  );
}
