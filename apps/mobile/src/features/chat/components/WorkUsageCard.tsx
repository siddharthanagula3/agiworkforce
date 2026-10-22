import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { WORK_USAGE_COPY, type WorkUsageRecovery } from '@agiworkforce/types';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { radii, useTheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const BILLING_ROUTE = '/(app)/settings/cloud-billing';

export function WorkUsageCard({ recovery }: { recovery: WorkUsageRecovery }) {
  const router = useRouter();
  const { colors } = useTheme();
  const actionLabel =
    recovery === 'add_credits'
      ? WORK_USAGE_COPY.addCredits
      : recovery === 'upgrade'
        ? WORK_USAGE_COPY.upgrade
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
          {WORK_USAGE_COPY.title}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.body }}>
          {WORK_USAGE_COPY.body[recovery]}
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
