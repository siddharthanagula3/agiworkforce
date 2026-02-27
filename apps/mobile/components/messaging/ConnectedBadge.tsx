import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

type ConnectionStatus = 'connected' | 'disconnected' | 'error';

interface ConnectedBadgeProps {
  status: ConnectionStatus;
}

const statusConfig: Record<
  ConnectionStatus,
  { color: string; label: string }
> = {
  connected: { color: colors.agentSuccess, label: 'Connected' },
  disconnected: { color: colors.textMuted, label: 'Not Connected' },
  error: { color: colors.agentError, label: 'Error' },
};

export function ConnectedBadge({ status }: ConnectedBadgeProps) {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (status === 'connected') {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 1000 }),
          withTiming(1, { duration: 1000 }),
        ),
        -1,
        true,
      );
      scale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 1000 }),
          withTiming(1, { duration: 1000 }),
        ),
        -1,
        true,
      );
    } else {
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withTiming(1, { duration: 200 });
    }
  }, [status, opacity, scale]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const { color, label } = statusConfig[status];

  return (
    <View className="flex-row items-center gap-1.5">
      <Animated.View
        style={[
          {
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color,
          },
          pulseStyle,
        ]}
      />
      <Text
        className="text-xs font-medium"
        style={{ color }}
      >
        {label}
      </Text>
    </View>
  );
}
