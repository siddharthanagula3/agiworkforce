import { View, Pressable } from 'react-native';
import { AlertTriangle, RotateCcw, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

interface SendErrorBannerProps {
  /** Error message from the chat store, or null when there is no error. */
  error: string | null;
  /** Retry the failed send. Omitted → no retry affordance is shown. */
  onRetry?: () => void;
  /** Dismiss the banner (clears the store error). */
  onDismiss: () => void;
}

/**
 * Banner shown above the composer when a chat send/stream fails. Previously the
 * chat store set `error` on failures but nothing rendered it, so network and
 * validation failures were silent. Render directly above <Composer /> alongside
 * ModelTierWarningBanner.
 */
export function SendErrorBanner({ error, onRetry, onDismiss }: SendErrorBannerProps) {
  const colors = useThemeColors();

  if (!error) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: `${colors.agentError}14`,
        borderTopWidth: 1,
        borderTopColor: `${colors.agentError}28`,
        gap: 8,
      }}
      accessibilityRole="alert"
      accessibilityLabel={`Message failed to send: ${error}`}
    >
      <AlertTriangle size={14} color={colors.agentError} strokeWidth={2} />
      <Text
        style={{ fontSize: 12, color: colors.agentError, fontWeight: '500', flex: 1 }}
        numberOfLines={2}
      >
        {error}
      </Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          accessibilityLabel="Retry sending message"
          accessibilityRole="button"
        >
          <RotateCcw size={13} color={colors.agentError} strokeWidth={2} />
          <Text style={{ fontSize: 12, color: colors.agentError, fontWeight: '600' }}>Retry</Text>
        </Pressable>
      )}
      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        accessibilityLabel="Dismiss error"
        accessibilityRole="button"
      >
        <X size={14} color={colors.agentError} />
      </Pressable>
    </View>
  );
}
