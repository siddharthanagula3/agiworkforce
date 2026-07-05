import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { ChevronDown, Clock } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { deriveReasoningPhrase, formatThinkingDuration } from '@agiworkforce/utils/reasoning';

interface ThinkingChipProps {
  /** Full thinking/reasoning text from the model */
  thinkingText: string;
  /** Whether thinking tokens are still streaming */
  isStreaming?: boolean;
  /** Duration in seconds shown after completion */
  duration?: number;
  /** Wall-clock ms when thinking began — drives the live elapsed timer while streaming */
  startedAtMs?: number;
}

/**
 * Inline collapsible thinking/reasoning block — action-status header (Clock
 * icon + "REASONING" label + live status) with a chevron that expands the
 * full reasoning text. Mirrors apps/web ThinkingBlock.tsx for cross-surface
 * parity: auto-expanded while streaming, auto-collapses once done unless the
 * user already toggled it manually. While streaming, a genuinely live
 * "Thinking for Xs" timer ticks every second from `startedAtMs`.
 */
export function ThinkingChip({
  thinkingText,
  isStreaming,
  duration,
  startedAtMs,
}: ThinkingChipProps) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(!!isStreaming);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const userToggledRef = useRef(false);
  const prevStreamingRef = useRef(isStreaming);

  useEffect(() => {
    if (prevStreamingRef.current !== isStreaming) {
      prevStreamingRef.current = isStreaming;
      if (!isStreaming && !userToggledRef.current) {
        setExpanded(false);
      }
    }
  }, [isStreaming]);

  // Live 1s tick while thinking streams — a real timer, not a static label.
  useEffect(() => {
    if (!isStreaming || startedAtMs === undefined) return;
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isStreaming, startedAtMs]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(expanded ? '180deg' : '0deg', { duration: 200 }) }],
  }));

  const handleToggle = () => {
    userToggledRef.current = true;
    setExpanded((prev) => !prev);
  };

  const liveSeconds =
    isStreaming && startedAtMs !== undefined
      ? Math.max(0, (nowMs - startedAtMs) / 1000)
      : undefined;
  const durationLabel = duration !== undefined ? formatThinkingDuration(duration) : undefined;
  const headerLabel = isStreaming
    ? liveSeconds !== undefined
      ? `${deriveReasoningPhrase(thinkingText)} • Thinking for ${formatThinkingDuration(liveSeconds)}`
      : deriveReasoningPhrase(thinkingText)
    : durationLabel !== undefined
      ? `Thought for ${durationLabel}`
      : 'Thought process';

  // Don't render an empty completed block (edge case: <thinking></thinking>).
  if (!isStreaming && thinkingText.trim().length === 0) return null;

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
      <Pressable
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} reasoning block`}
        accessibilityState={{ expanded }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 7,
          paddingHorizontal: 10,
        }}
      >
        <Clock size={13} color={colors.textMuted} />

        <Text
          style={{
            fontSize: 9,
            fontWeight: '600',
            letterSpacing: 1,
            color: colors.textMuted,
            textTransform: 'uppercase',
          }}
        >
          Reasoning
        </Text>

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

        <Animated.View style={chevronStyle}>
          <ChevronDown size={14} color={colors.textMuted} />
        </Animated.View>
      </Pressable>

      {expanded ? (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            maxHeight: 240,
          }}
        >
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8 }}
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={{
                fontSize: 12,
                lineHeight: 17,
                fontStyle: 'italic',
                color: colors.textMuted,
              }}
            >
              {thinkingText}
            </Text>
          </ScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}
