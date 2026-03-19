/**
 * ToolTimeline — vertical timeline for agent execution steps.
 *
 * Props: { steps: StatusStep[] }
 *
 * Layout per row:
 *   [time label] | [vertical line + status dot] | [step content]
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { CheckCircle2, XCircle, Search, Terminal, Brain, Code } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import type { StatusStep, StepIcon } from '@/types/chat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a compact relative time label such as "2m ago", "just now". */
function relativeLabel(isoDate: string | undefined): string {
  if (!isoDate) return '';
  try {
    const diffMs = Date.now() - new Date(isoDate).getTime();
    if (diffMs < 0) return 'just now';
    const secs = Math.floor(diffMs / 1000);
    if (secs < 10) return 'just now';
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  } catch {
    return '';
  }
}

/** Map StepIcon to a Lucide icon component. */
function StepIconComponent({ icon, color }: { icon: StepIcon; color: string }) {
  const size = 12;
  switch (icon) {
    case 'searching':
      return <Search size={size} color={color} />;
    case 'coding':
      return <Code size={size} color={color} />;
    case 'command':
      return <Terminal size={size} color={color} />;
    case 'thinking':
      return <Brain size={size} color={color} />;
    case 'success':
      return <CheckCircle2 size={size} color={color} />;
    case 'error':
      return <XCircle size={size} color={color} />;
    default:
      return <Brain size={size} color={color} />;
  }
}

// ---------------------------------------------------------------------------
// Pulsing dot for running steps
// ---------------------------------------------------------------------------

function PulsingDot({ color }: { color: string }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    backgroundColor: color,
  }));

  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      {/* Static inner core */}
      <View
        style={{
          position: 'absolute',
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
      {/* Pulsing ring */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 10,
            height: 10,
            borderRadius: 5,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Timeline Row
// ---------------------------------------------------------------------------

interface TimelineRowProps {
  step: StatusStep;
  index: number;
  isLast: boolean;
  /** Optional ISO timestamp stored on the step (may not exist in base type). */
  timestamp?: string;
}

function TimelineRow({ step, index, isLast, timestamp }: TimelineRowProps) {
  const isRunning = step.status === 'running';
  const isCompleted = step.status === 'completed';

  const dotColor = isCompleted
    ? colors.agentSuccess
    : step.status === 'failed'
      ? colors.agentError
      : colors.agentActive;

  const iconColor = isCompleted
    ? colors.agentSuccess
    : step.status === 'failed'
      ? colors.agentError
      : colors.agentActive;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 60).duration(220)}
      style={{ flexDirection: 'row', minHeight: 44 }}
    >
      {/* Left column: time label — fixed width so all rows align */}
      <View style={{ width: 44, alignItems: 'flex-end', paddingTop: 2, paddingRight: 8 }}>
        <Text style={{ fontSize: 10, color: colors.textMuted, lineHeight: 14 }}>
          {relativeLabel(timestamp)}
        </Text>
      </View>

      {/* Centre column: vertical line + status dot */}
      <View style={{ width: 20, alignItems: 'center' }}>
        {/* Dot */}
        <View style={{ marginTop: 2 }}>
          {isRunning ? (
            <PulsingDot color={dotColor} />
          ) : isCompleted ? (
            <CheckCircle2 size={10} color={dotColor} />
          ) : step.status === 'failed' ? (
            <XCircle size={10} color={dotColor} />
          ) : (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: dotColor,
                opacity: 0.5,
              }}
            />
          )}
        </View>

        {/* Connecting line (not drawn for the last item) */}
        {!isLast && (
          <View
            style={{
              flex: 1,
              width: 1,
              marginTop: 4,
              backgroundColor: 'rgba(255,255,255,0.1)',
            }}
          />
        )}
      </View>

      {/* Right column: step content */}
      <View style={{ flex: 1, paddingLeft: 10, paddingBottom: isLast ? 0 : 14 }}>
        {/* Icon + message row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingTop: 1 }}>
          <View style={{ marginTop: 1 }}>
            <StepIconComponent icon={step.icon} color={iconColor} />
          </View>
          <Text
            style={{
              flex: 1,
              fontSize: 13,
              color: isRunning
                ? colors.textPrimary
                : step.status === 'failed'
                  ? colors.agentError
                  : colors.textSecondary,
              lineHeight: 18,
            }}
          >
            {step.message}
          </Text>
        </View>

        {/* Detail line */}
        {step.detail ? (
          <Text
            style={{
              fontSize: 11,
              color: colors.textMuted,
              marginTop: 3,
              marginLeft: 18,
              lineHeight: 15,
            }}
            numberOfLines={3}
          >
            {step.detail}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// ToolTimeline (named export)
// ---------------------------------------------------------------------------

export interface ToolTimelineProps {
  steps: StatusStep[];
}

export function ToolTimeline({ steps }: ToolTimelineProps) {
  if (steps.length === 0) return null;

  return (
    <View>
      {steps.map((step, i) => (
        <TimelineRow
          key={step.id}
          step={step}
          index={i}
          isLast={i === steps.length - 1}
          // StatusStep does not carry a timestamp field in the base type —
          // we read it defensively via type cast so the timeline degrades
          // gracefully if the field is absent.
          timestamp={(step as StatusStep & { timestamp?: string }).timestamp}
        />
      ))}
    </View>
  );
}
