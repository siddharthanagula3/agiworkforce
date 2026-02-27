import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import type { ConnectionStatus } from '@/stores/connectionStore';

interface PairingStatusProps {
  status: ConnectionStatus;
  desktopName: string | null;
  error: string | null;
}

interface StatusConfig {
  color: string;
  label: string;
  animate: boolean;
}

function getStatusConfig(
  status: ConnectionStatus,
  desktopName: string | null,
  error: string | null,
): StatusConfig {
  switch (status) {
    case 'connected':
      return {
        color: colors.agentSuccess,
        label: `Connected to ${desktopName ?? 'Desktop'}`,
        animate: false,
      };
    case 'connecting':
      return {
        color: colors.agentWarning,
        label: 'Connecting...',
        animate: true,
      };
    case 'error':
      return {
        color: colors.agentError,
        label: error ?? 'Connection error',
        animate: false,
      };
    case 'disconnected':
    default:
      return {
        color: colors.textMuted,
        label: 'Not connected',
        animate: false,
      };
  }
}

export function PairingStatus({ status, desktopName, error }: PairingStatusProps) {
  const config = getStatusConfig(status, desktopName, error);
  const pulseOpacity = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (config.animate) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulseOpacity);
      cancelAnimation(pulseScale);
      pulseOpacity.value = withTiming(1, { duration: 200 });
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [config.animate, pulseOpacity, pulseScale]);

  const dotAnimatedStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <View className="flex-row items-center gap-2.5 py-2 px-3 rounded-lg bg-white/5">
      <Animated.View
        style={[
          {
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: config.color,
          },
          dotAnimatedStyle,
        ]}
      />
      <Text
        className="text-sm flex-1"
        style={{ color: config.color }}
        numberOfLines={2}
      >
        {config.label}
      </Text>
    </View>
  );
}
