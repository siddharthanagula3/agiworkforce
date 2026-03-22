import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { Clock, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

interface ThinkingLineProps {
  /** Whether the model is still streaming thinking tokens */
  isStreaming?: boolean;
  /** Duration in seconds (only shown after completion) */
  duration?: number;
  /** Callback when the line is tapped to open bottom sheet */
  onPress: () => void;
}

/**
 * Collapsed thinking/reasoning line displayed in chat.
 *
 * During streaming: "Thinking..."
 * After completion: "Thought for X.Xs"
 *
 * Tapping opens the ThinkingBottomSheet with full reasoning text.
 */
export function ThinkingLine({ isStreaming, duration, onPress }: ThinkingLineProps) {
  const handlePress = useCallback(() => {
    onPress();
  }, [onPress]);

  const label = isStreaming
    ? 'Thinking...'
    : duration !== undefined
      ? `Thought for ${duration.toFixed(1)}s`
      : 'Thought process';

  return (
    <Pressable
      onPress={handlePress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 2,
      }}
      accessibilityLabel={`${label}. Tap to view thought process.`}
      accessibilityRole="button"
    >
      <Clock size={14} color={colors.textMuted} />
      <Text
        style={{
          flex: 1,
          fontSize: 13,
          color: colors.textMuted,
          fontWeight: '500',
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <ChevronRight size={14} color={colors.textMuted} />
    </Pressable>
  );
}
