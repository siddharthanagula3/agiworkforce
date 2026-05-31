import { useCallback, useState } from 'react';
import { View, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Clock, ChevronRight, ChevronDown } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/src/ui/theme';

/** Strips local/provider reasoning XML tags from content. */
function stripReasoningTags(text: string): string {
  return text
    .replace(/<\/?think>/gi, '')
    .replace(/<\/?thinking>/gi, '')
    .replace(/<\/?reasoning>/gi, '')
    .trim();
}

/** Returns the first non-empty line of the cleaned reasoning text. */
function getFirstLine(text: string): string {
  const clean = stripReasoningTags(text);
  const firstLine = clean.split('\n').find((line) => line.trim().length > 0) ?? '';
  return firstLine.trim();
}

interface ThinkingChipProps {
  /** Full thinking/reasoning text from the model */
  thinkingText: string;
  /** Whether thinking tokens are still streaming */
  isStreaming?: boolean;
  /** Duration in seconds shown after completion */
  duration?: number;
}

/**
 * Inline expandable thinking chip rendered directly in the chat message list.
 *
 * Collapsed state: clock icon + "Thinking..." (streaming) or "Thought for Xs" +
 * first-line preview of reasoning content.
 *
 * Expanded state: full reasoning text, scrollable within the message column.
 *
 * Replaces the ThinkingLine + ThinkingBottomSheet pair as the default path.
 * ThinkingBottomSheet is preserved as a fallback for consumers that still use it.
 */
export function ThinkingChip({ thinkingText, isStreaming, duration }: ThinkingChipProps) {
  const [expanded, setExpanded] = useState(false);
  const animatedHeight = useSharedValue(0);

  const cleanText = stripReasoningTags(thinkingText);
  const firstLine = getFirstLine(thinkingText);

  const headerLabel = isStreaming
    ? 'Thinking...'
    : duration !== undefined
      ? `Thought for ${duration.toFixed(1)}s`
      : 'Thought process';

  // Estimated expanded height: roughly 18px per line, max 320px.
  const estimatedLines = Math.min(cleanText.split('\n').length + 2, 24);
  const estimatedContentHeight = estimatedLines * 20 + 16;

  const contentStyle = useAnimatedStyle(() => ({
    maxHeight: animatedHeight.value * estimatedContentHeight,
    opacity: animatedHeight.value,
    overflow: 'hidden' as const,
  }));

  const toggleExpanded = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    animatedHeight.value = withTiming(next ? 1 : 0, {
      duration: 250,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
  }, [expanded, animatedHeight]);

  const accessibilityLabel = isStreaming
    ? 'Thinking in progress. Tap to expand thought process.'
    : `${headerLabel}. Tap to ${expanded ? 'collapse' : 'expand'} thought process.`;

  return (
    <View
      style={{
        marginVertical: 2,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: colors.surfaceOverlay,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {/* Collapsed header — always visible */}
      <Pressable
        onPress={toggleExpanded}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 7,
          paddingHorizontal: 10,
        }}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
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
          {!isStreaming && firstLine.length > 0 && !expanded && (
            <Text
              style={{
                fontSize: 11,
                color: colors.textMuted,
                marginTop: 1,
                opacity: 0.7,
              }}
              numberOfLines={1}
            >
              {firstLine}
            </Text>
          )}
        </View>

        {expanded ? (
          <ChevronDown size={13} color={colors.textMuted} />
        ) : (
          <ChevronRight size={13} color={colors.textMuted} />
        )}
      </Pressable>

      {/* Expandable reasoning content */}
      <Animated.View style={contentStyle}>
        <View
          style={{
            paddingHorizontal: 10,
            paddingBottom: 10,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              lineHeight: 20,
              color: colors.textSecondary,
              marginTop: 8,
            }}
            selectable
          >
            {cleanText}
            {isStreaming ? '...' : ''}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}
