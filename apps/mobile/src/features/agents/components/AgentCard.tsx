import { View, Pressable } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { Bot } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { AgentStatusBadge } from './AgentStatusBadge';
import { useThemeColors } from '@/src/ui/theme';
import { formatRelativeTime } from '@agiworkforce/utils/format';
import type { Agent } from '@/stores/agentStore';

interface AgentCardProps {
  agent: Agent;
  index: number;
  onPress: (id: string) => void;
}

// Derived from the live palette: the status colours differ per theme, so a
// module-scope constant would freeze one theme's values into both.
function statusBarColor(
  status: Agent['status'],
  colors: ReturnType<typeof useThemeColors>,
): string {
  switch (status) {
    case 'running':
      return colors.agentActive;
    case 'completed':
      return colors.agentSuccess;
    case 'failed':
      return colors.agentError;
    case 'waiting':
      return colors.agentWarning;
  }
}

export function AgentCard({ agent, index, onPress }: AgentCardProps) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const barColor = statusBarColor(agent.status, colors);
  const lastUpdated = agent.updatedAt ?? agent.startedAt;

  return (
    <Animated.View
      entering={
        reducedMotion
          ? undefined
          : FadeInDown.duration(300)
              .delay(index * 80)
              .springify()
      }
    >
      <Pressable
        onPress={() => onPress(agent.id)}
        className="rounded-xl overflow-hidden active:opacity-80"
        style={{ backgroundColor: colors.surfaceElevated }}
        accessibilityLabel={`Agent: ${agent.name}, ${agent.status}, ${agent.progress}% complete`}
        accessibilityRole="button"
      >
        <View className="p-3 gap-2">
          {/* Top row: icon + name */}
          <View className="flex-row items-center gap-2">
            <View
              className="w-8 h-8 rounded-lg items-center justify-center"
              style={{ backgroundColor: `${barColor}15` }}
            >
              <Bot size={16} color={barColor} />
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-semibold text-white" numberOfLines={1}>
                {agent.name}
              </Text>
              <Text variant="caption" className="text-white/40 text-[10px]" numberOfLines={1}>
                {agent.model}
              </Text>
            </View>
            {/* Status badge top-right */}
            <AgentStatusBadge status={agent.status} />
          </View>

          {/* Current step */}
          {agent.currentStep ? (
            <Text variant="caption" className="text-white/50 text-[11px]" numberOfLines={2}>
              {agent.currentStep}
            </Text>
          ) : null}

          {/* Progress bar */}
          <View className="h-1.5 bg-white/8 rounded-full overflow-hidden">
            <View
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, agent.progress))}%`,
                backgroundColor: barColor,
              }}
            />
          </View>

          {/* Footer: progress % + last updated */}
          <View className="flex-row items-center justify-between">
            <Text variant="caption" className="text-white/30 text-[10px]">
              {agent.progress}%
            </Text>
            {lastUpdated ? (
              <Text variant="caption" className="text-white/30 text-[10px]">
                {formatRelativeTime(lastUpdated)}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
