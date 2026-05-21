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
import { Wifi, WifiOff, WifiLow } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import type { ConnectionStatus, ConnectionQuality } from '@/stores/connectionStore';

interface PairingStatusProps {
  status: ConnectionStatus;
  desktopName: string | null;
  error: string | null;
  connectionQuality?: ConnectionQuality;
  latencyMs?: number | null;
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
    case 'stale':
      return {
        color: colors.agentWarning,
        label: `${desktopName ?? 'Desktop'} — heartbeat missed`,
        animate: true,
      };
    case 'reconnecting':
      return {
        color: colors.agentWarning,
        label: 'Reconnecting...',
        animate: true,
      };
    case 'session_expired':
      return {
        color: colors.agentError,
        label: 'Session expired',
        animate: false,
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

function ConnectionQualityBadge({
  quality,
  latencyMs,
}: {
  quality: ConnectionQuality;
  latencyMs?: number | null;
}) {
  switch (quality) {
    case 'strong':
      return (
        <View className="flex-row items-center gap-1">
          <Wifi size={11} color={colors.agentSuccess} />
          {latencyMs != null && <Text className="text-[10px] text-emerald-400">{latencyMs}ms</Text>}
        </View>
      );
    case 'weak':
      return (
        <View className="flex-row items-center gap-1">
          <WifiLow size={11} color={colors.agentWarning} />
          {latencyMs != null && <Text className="text-[10px] text-amber-400">{latencyMs}ms</Text>}
        </View>
      );
    case 'disconnected':
      return <WifiOff size={11} color={colors.agentError} />;
  }
}

export function PairingStatus({
  status,
  desktopName,
  error,
  connectionQuality,
  latencyMs,
}: PairingStatusProps) {
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
    <View
      className="flex-row items-center gap-2.5 py-2 px-3 rounded-lg bg-white/5"
      accessibilityLabel={`Connection status: ${config.label}`}
      accessibilityRole="text"
    >
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
      <Text className="text-sm flex-1" style={{ color: config.color }} numberOfLines={2}>
        {config.label}
      </Text>
      {/* Connection quality indicator — only shown when connected */}
      {status === 'connected' && connectionQuality != null && (
        <ConnectionQualityBadge quality={connectionQuality} latencyMs={latencyMs} />
      )}
    </View>
  );
}
