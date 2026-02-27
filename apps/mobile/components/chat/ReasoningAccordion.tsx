import { useState, useEffect, useCallback } from 'react';
import { View, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { ChevronDown, Brain } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

interface ReasoningAccordionProps {
  reasoning: string;
  isStreaming?: boolean;
}

/**
 * Strips <thinking> and <reasoning> XML tags from content.
 */
function stripReasoningTags(text: string): string {
  return text
    .replace(/<\/?thinking>/gi, '')
    .replace(/<\/?reasoning>/gi, '')
    .trim();
}

/**
 * Generates a short summary from the reasoning content.
 * Takes the first ~50 characters, trimmed to a word boundary.
 */
function getSummary(text: string): string {
  const clean = stripReasoningTags(text);
  if (clean.length <= 50) return clean;
  const truncated = clean.slice(0, 50);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

/**
 * Counts words in the reasoning content.
 */
function getWordCount(text: string): number {
  const clean = stripReasoningTags(text);
  if (!clean) return 0;
  return clean.split(/\s+/).filter(Boolean).length;
}

const COLLAPSED_HEIGHT = 0;
const MAX_CONTENT_HEIGHT = 300;

/**
 * Collapsible thinking/reasoning section with purple accent.
 * Auto-expands during streaming, auto-collapses when streaming ends.
 */
export function ReasoningAccordion({ reasoning, isStreaming }: ReasoningAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const animatedHeight = useSharedValue(COLLAPSED_HEIGHT);
  const chevronRotation = useSharedValue(0);

  const cleanContent = stripReasoningTags(reasoning);
  const summary = getSummary(reasoning);
  const wordCount = getWordCount(reasoning);

  // Auto-expand during streaming, auto-collapse when done
  useEffect(() => {
    if (isStreaming && !isExpanded) {
      setIsExpanded(true);
    } else if (!isStreaming && isExpanded) {
      // Delay collapse slightly so user sees the final state
      const timer = setTimeout(() => {
        setIsExpanded(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const targetHeight = isExpanded
      ? Math.min(contentHeight, MAX_CONTENT_HEIGHT)
      : COLLAPSED_HEIGHT;

    animatedHeight.value = withTiming(targetHeight, {
      duration: 250,
      easing: Easing.out(Easing.ease),
    });

    chevronRotation.value = withTiming(isExpanded ? 180 : 0, {
      duration: 250,
      easing: Easing.out(Easing.ease),
    });
  }, [isExpanded, contentHeight, animatedHeight, chevronRotation]);

  const containerStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
    overflow: 'hidden' as const,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  if (!cleanContent) return null;

  return (
    <View
      style={{
        marginVertical: 6,
        borderLeftWidth: 2,
        borderLeftColor: colors.agentThinking,
        borderRadius: 8,
        backgroundColor: 'rgba(168, 85, 247, 0.08)',
        overflow: 'hidden',
      }}
    >
      {/* Header — always visible */}
      <Pressable
        onPress={handleToggle}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 10,
          gap: 8,
        }}
        accessibilityLabel={isExpanded ? 'Collapse reasoning' : 'Expand reasoning'}
        accessibilityRole="button"
      >
        <Brain size={14} color={colors.agentThinking} />
        <Text
          style={{
            flex: 1,
            fontSize: 12,
            color: colors.agentThinking,
            fontWeight: '500',
          }}
          numberOfLines={1}
        >
          {isExpanded ? 'Thinking' : summary}
        </Text>
        <Text style={{ fontSize: 10, color: 'rgba(168, 85, 247, 0.6)' }}>
          {wordCount} words
        </Text>
        <Animated.View style={chevronStyle}>
          <ChevronDown size={14} color={colors.agentThinking} />
        </Animated.View>
      </Pressable>

      {/* Expandable content */}
      <Animated.View style={containerStyle}>
        <View
          onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
          style={{
            paddingHorizontal: 12,
            paddingBottom: 10,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              lineHeight: 20,
              color: 'rgba(245, 247, 251, 0.65)',
            }}
            selectable
          >
            {cleanContent}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}
