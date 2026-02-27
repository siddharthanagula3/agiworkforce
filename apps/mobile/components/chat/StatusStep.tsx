import { useState, useCallback, useEffect } from 'react';
import { View, Pressable } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  Brain,
  Search,
  Code,
  Terminal,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import type { StatusStep as StatusStepType, StepIcon } from '@/types/chat';

interface StatusStepProps {
  step: StatusStepType;
  stepNumber?: number;
  totalSteps?: number;
}

const ICON_CONFIG: Record<StepIcon, { icon: typeof Brain; color: string }> = {
  thinking: { icon: Brain, color: colors.agentThinking },
  searching: { icon: Search, color: colors.teal },
  coding: { icon: Code, color: colors.agentActive },
  command: { icon: Terminal, color: colors.agentSuccess },
  success: { icon: CheckCircle2, color: colors.agentSuccess },
  error: { icon: XCircle, color: colors.agentError },
};

function PulsingIndicator({ color }: { color: string }) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    backgroundColor: color,
  }));

  return (
    <View className="relative w-2 h-2">
      <View
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <Animated.View
        className="absolute inset-0 rounded-full"
        style={pulseStyle}
      />
    </View>
  );
}

function StepStatusIndicator({ status }: { status: StatusStepType['status'] }) {
  switch (status) {
    case 'running':
      return <PulsingIndicator color={colors.agentActive} />;
    case 'completed':
      return <CheckCircle2 size={12} color={colors.agentSuccess} />;
    case 'failed':
      return <XCircle size={12} color={colors.agentError} />;
  }
}

export function StatusStep({ step, stepNumber, totalSteps }: StatusStepProps) {
  const [expanded, setExpanded] = useState(false);

  const iconConfig = ICON_CONFIG[step.icon];
  const StepIconComponent = iconConfig.icon;
  const iconColor = iconConfig.color;

  const hasDetail = Boolean(step.detail);

  const toggleExpanded = useCallback(() => {
    if (hasDetail) {
      setExpanded((prev) => !prev);
    }
  }, [hasDetail]);

  return (
    <Animated.View entering={FadeInDown.duration(250).springify()}>
      <Pressable onPress={toggleExpanded} disabled={!hasDetail}>
        <View
          className="flex-row items-start gap-2.5 px-3 py-2 rounded-lg my-0.5"
          style={{ backgroundColor: `${colors.surfaceOverlay}80` }}
        >
          {/* Icon */}
          <View className="mt-0.5">
            {step.status === 'running' ? (
              <Loader2 size={16} color={iconColor} />
            ) : (
              <StepIconComponent size={16} color={iconColor} />
            )}
          </View>

          {/* Content */}
          <View className="flex-1">
            {/* Message row */}
            <View className="flex-row items-center gap-2">
              <Text
                className="text-[13px] text-white/80 flex-1 flex-shrink"
                numberOfLines={expanded ? undefined : 2}
              >
                {step.message}
              </Text>
              <StepStatusIndicator status={step.status} />
            </View>

            {/* Step counter */}
            {stepNumber != null && totalSteps != null ? (
              <Text variant="caption" className="text-white/30 text-[10px] mt-0.5">
                Step {stepNumber} of {totalSteps}
              </Text>
            ) : null}

            {/* Progress bar */}
            {step.progress != null ? (
              <View className="h-1 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, step.progress))}%`,
                    backgroundColor: iconColor,
                  }}
                />
              </View>
            ) : null}

            {/* Expandable detail */}
            {hasDetail ? (
              <View className="flex-row items-center gap-1 mt-1">
                {expanded ? (
                  <ChevronDown size={10} color={colors.textMuted} />
                ) : (
                  <ChevronRight size={10} color={colors.textMuted} />
                )}
                <Text variant="caption" className="text-white/30 text-[10px]">
                  {expanded ? 'Hide details' : 'Show details'}
                </Text>
              </View>
            ) : null}

            {expanded && step.detail ? (
              <View className="mt-1.5 bg-black/20 rounded-md px-2 py-1.5">
                <Text variant="mono" className="text-[11px] text-white/50">
                  {step.detail}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
