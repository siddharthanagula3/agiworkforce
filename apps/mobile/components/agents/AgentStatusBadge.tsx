import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import type { Agent } from '@/stores/agentStore';

interface AgentStatusBadgeProps {
  status: Agent['status'];
}

const STATUS_CONFIG: Record<
  Agent['status'],
  {
    icon: typeof Loader2;
    label: string;
    color: string;
    bgClass: string;
  }
> = {
  running: {
    icon: Loader2,
    label: 'Running',
    color: colors.agentActive,
    bgClass: 'bg-blue-500/15',
  },
  completed: {
    icon: CheckCircle2,
    label: 'Done',
    color: colors.agentSuccess,
    bgClass: 'bg-emerald-500/15',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    color: colors.agentError,
    bgClass: 'bg-red-500/15',
  },
  waiting: {
    icon: Clock,
    label: 'Waiting',
    color: colors.agentWarning,
    bgClass: 'bg-amber-500/15',
  },
};

function PulsingDot({ color }: { color: string }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.8, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    backgroundColor: color,
  }));

  return (
    <View className="relative">
      <View
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <Animated.View
        className="absolute -inset-0.5 rounded-full"
        style={pulseStyle}
      />
    </View>
  );
}

export function AgentStatusBadge({ status }: AgentStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full ${config.bgClass}`}>
      {status === 'running' ? (
        <PulsingDot color={config.color} />
      ) : (
        <Icon size={10} color={config.color} />
      )}
      <Text
        className="text-[10px] font-medium uppercase tracking-wider"
        style={{ color: config.color }}
      >
        {config.label}
      </Text>
    </View>
  );
}
