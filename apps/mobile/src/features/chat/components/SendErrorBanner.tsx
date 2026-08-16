import { View, Pressable } from 'react-native';
import { AlertTriangle, RotateCcw, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

interface SendErrorBannerProps {
  error: string | null;
  onRetry?: () => void;
  onDismiss: () => void;
}

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
        backgroundColor: colors.dangerSurface,
        borderTopWidth: 1,
        borderTopColor: colors.dangerBorder,
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
