import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  PRODUCT_NAMES,
  classifyManagedQuotaErrorCode,
  getNextUpgradeTier,
  isFreeBillingPlanTier,
  isSelfServePaidPlanTier,
} from '@agiworkforce/types';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { radii, useTheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export const WORK_USAGE_CARD_TITLE = `You’re out of ${PRODUCT_NAMES.work} usage for now`;
export const WORK_USAGE_ADD_CREDITS_LABEL = 'Add credits';
export const WORK_USAGE_UPGRADE_LABEL = 'Upgrade';

const BILLING_ROUTE = '/(app)/settings/cloud-billing';
const ACCOUNT_WIDE_FEATURES: ReadonlySet<string> = new Set(['token_cap', 'rolling_capacity']);

export type WorkUsageRecovery = 'add_credits' | 'upgrade' | 'wait';

export function resolveWorkUsageRecovery(
  code: string | null | undefined,
  tier: string | null | undefined,
): WorkUsageRecovery | null {
  const block = classifyManagedQuotaErrorCode(code);
  if (!block || !ACCOUNT_WIDE_FEATURES.has(block.feature) || block.suggestStandardModel) {
    return null;
  }
  if (isFreeBillingPlanTier(tier)) return 'upgrade';
  if (block.clearedByCredits && isSelfServePaidPlanTier(tier)) return 'add_credits';
  return getNextUpgradeTier(tier) ? 'upgrade' : 'wait';
}

const BODY: Record<WorkUsageRecovery, string> = {
  add_credits: 'Add credits to keep going now, or wait for your usage to reset.',
  upgrade: 'Upgrade to keep going now, or wait for your usage to reset.',
  wait: 'Your usage comes back when it resets.',
};

export function WorkUsageCard({ recovery }: { recovery: WorkUsageRecovery }) {
  const router = useRouter();
  const { colors } = useTheme();
  const actionLabel =
    recovery === 'add_credits'
      ? WORK_USAGE_ADD_CREDITS_LABEL
      : recovery === 'upgrade'
        ? WORK_USAGE_UPGRADE_LABEL
        : null;

  return (
    <View
      testID="chat.composer.work-usage"
      accessibilityRole="alert"
      style={{
        marginBottom: 8,
        gap: 12,
        padding: 16,
        borderRadius: radii.xl,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text
          accessibilityRole="header"
          style={{ color: colors.textPrimary, fontSize: typeScale.headline, fontWeight: '600' }}
        >
          {WORK_USAGE_CARD_TITLE}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.body }}>
          {BODY[recovery]}
        </Text>
      </View>
      {actionLabel ? (
        <Button
          title={actionLabel}
          size="md"
          onPress={() => router.push(BILLING_ROUTE as Parameters<typeof router.push>[0])}
          style={{ borderRadius: radii.full }}
        />
      ) : null}
    </View>
  );
}
