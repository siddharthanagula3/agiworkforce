import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  WORK_USAGE_COPY,
  workUsageRecoveryActionLabel,
  type WorkUsageRecovery,
} from '@agiworkforce/types';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';
import { radii, useTheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const BILLING_ROUTE = '/(app)/settings/cloud-billing';
const WAIT_BODY = 'Wait for your usage to reset.';

export function WorkUsageCard({ recovery }: { recovery: WorkUsageRecovery }) {
  const router = useRouter();
  const { colors } = useTheme();
  const actionLabel = NATIVE_PURCHASES_AVAILABLE ? workUsageRecoveryActionLabel(recovery) : null;

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
          {WORK_USAGE_COPY.title}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.body }}>
          {NATIVE_PURCHASES_AVAILABLE ? WORK_USAGE_COPY.body[recovery] : WAIT_BODY}
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
