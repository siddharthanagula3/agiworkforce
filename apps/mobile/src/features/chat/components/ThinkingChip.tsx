import { View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

interface ThinkingChipProps {
  /** Full thinking/reasoning text from the model */
  thinkingText: string;
  /** Whether thinking tokens are still streaming */
  isStreaming?: boolean;
  /** Duration in seconds shown after completion */
  duration?: number;
}

/**
 * Inline thinking chip rendered directly in the chat message list.
 * Mobile intentionally does not expose chain-of-thought text.
 */
export function ThinkingChip({ isStreaming, duration }: ThinkingChipProps) {
  const colors = useThemeColors();

  const headerLabel = isStreaming
    ? 'Thinking...'
    : duration !== undefined
      ? `Thought for ${duration.toFixed(1)}s`
      : 'Thought process';

  return (
    <View
      accessibilityLabel={isStreaming ? 'Thinking in progress' : headerLabel}
      style={{
        marginVertical: 2,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: colors.surfaceOverlay,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 7,
          paddingHorizontal: 10,
        }}
      >
        <Clock size={13} color={colors.textMuted} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '500',
              color: colors.textMuted,
            }}
            numberOfLines={1}
          >
            {headerLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}
