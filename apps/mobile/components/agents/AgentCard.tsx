import { View, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Bot } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { AgentStatusBadge } from './AgentStatusBadge';
import { colors } from '@/lib/theme';
import { formatRelativeTime } from '@agiworkforce/utils';
import type { Agent } from '@/stores/agentStore';

interface AgentCardProps {
  agent: Agent;
  index: number;
  onPress: (id: string) => void;
}

const STATUS_BAR_COLOR: Record<Agent['status'], string> = {
  running: colors.agentActive,
  completed: colors.agentSuccess,
  failed: colors.agentError,
  waiting: colors.agentWarning,
};

export function AgentCard({ agent, index, onPress }: AgentCardProps) {
  const barColor = STATUS_BAR_COLOR[agent.status];
  const lastUpdated = agent.updatedAt ?? agent.startedAt;

  return (
    <Animated.View
      entering={FadeInDown.duration(300)
        .delay(index * 80)
        .springify()}
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
