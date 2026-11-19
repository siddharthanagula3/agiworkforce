import { View } from 'react-native';
import { Cloud } from 'lucide-react-native';
import type { CloudCodeAvailability } from '@agiworkforce/types';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export type CloudAgentStatusKind = 'available' | 'unavailable' | 'unknown';

export interface CloudAgentStatusView {
  kind: CloudAgentStatusKind;
  label: string;
}

export const CLOUD_AGENT_STATUS_LABELS = Object.freeze({
  available: 'Available',
  deploymentDisabled: 'Not available on this server',
  planNotEntitled: 'Not included in your account',
  unknown: 'Status unavailable',
});

export function cloudAgentStatus(
  availability: CloudCodeAvailability | null,
  failed: boolean,
): CloudAgentStatusView {
  if (failed || !availability) {
    return { kind: 'unknown', label: CLOUD_AGENT_STATUS_LABELS.unknown };
  }
  if (!availability.deploymentEnabled) {
    return { kind: 'unavailable', label: CLOUD_AGENT_STATUS_LABELS.deploymentDisabled };
  }
  if (!availability.planEntitled) {
    return { kind: 'unavailable', label: CLOUD_AGENT_STATUS_LABELS.planNotEntitled };
  }
  return { kind: 'available', label: CLOUD_AGENT_STATUS_LABELS.available };
}

export function CloudAgentStatusRow({
  loading,
  availability,
  failed,
  onRetry,
}: {
  loading: boolean;
  availability: CloudCodeAvailability | null;
  failed: boolean;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  const status = cloudAgentStatus(availability, failed);
  const dotColor =
    status.kind === 'available'
      ? colors.agentSuccess
      : status.kind === 'unavailable'
        ? colors.textSecondary
        : colors.textMuted;
  const retryable = !loading && status.kind === 'unknown';

  const label = loading
    ? 'Cloud. Checking'
    : `Cloud. ${status.label}${retryable ? '. Tap to retry' : ''}`;

  const content = (
    <View
      style={{
        minHeight: 52,
        paddingHorizontal: 14,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Cloud size={19} color={colors.textSecondary} />
      <Text style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.body }}>Cloud</Text>
      {loading ? (
        <LoadingIndicator size="small" />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 200 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
          <Text
            numberOfLines={2}
            style={{
              color: colors.textMuted,
              fontSize: typeScale.footnote,
              flexShrink: 1,
              textAlign: 'right',
            }}
          >
            {status.label}
          </Text>
        </View>
      )}
    </View>
  );

  if (!retryable) {
    return (
      <View accessible accessibilityLabel={label} testID="code-cloud-status">
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="code-cloud-status"
    >
      {content}
    </Pressable>
  );
}
