import Animated, { FadeIn } from 'react-native-reanimated';
import { View, Pressable } from 'react-native';
import { AlertTriangle, SignalZero, Clock, RotateCcw } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

const STALE_THRESHOLD_MS = 90_000;

interface StaleApprovalBannerProps {
  lastHeartbeatAt: number;
}

export function StaleApprovalBanner({ lastHeartbeatAt }: StaleApprovalBannerProps) {
  const ageMs = Date.now() - lastHeartbeatAt;
  if (ageMs < STALE_THRESHOLD_MS) return null;

  const ageSeconds = Math.floor(ageMs / 1000);
  const ageLabel = ageSeconds >= 60 ? `${Math.floor(ageSeconds / 60)}m ago` : `${ageSeconds}s ago`;

  return (
    <Animated.View entering={FadeIn.duration(300)} className="mx-4 mb-3">
      <View className="flex-row items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
        <AlertTriangle size={14} color={colors.agentWarning} style={{ marginTop: 1 }} />
        <View className="flex-1">
          <Text className="text-xs font-semibold text-amber-400 mb-0.5">
            Approval may be outdated
          </Text>
          <Text className="text-[11px] text-amber-400/70 leading-4">
            Last desktop contact {ageLabel}. The desktop may have moved on.
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

interface DisconnectedDesktopBannerProps {
  onReconnect: () => void;
}

export function DisconnectedDesktopBanner({ onReconnect }: DisconnectedDesktopBannerProps) {
  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <View className="flex-row items-center gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/25">
        <SignalZero size={14} color={colors.agentError} />
        <View className="flex-1">
          <Text className="text-xs font-semibold text-red-400 mb-0.5">Desktop unreachable</Text>
          <Text className="text-[11px] text-red-400/70">Heartbeat missed. Auto-reconnecting.</Text>
        </View>
        <Pressable
          onPress={onReconnect}
          className="px-2.5 py-1.5 rounded-lg bg-red-500/20 active:bg-red-500/30"
          accessibilityLabel="Reconnect to desktop"
          accessibilityRole="button"
        >
          <Text className="text-xs text-red-400 font-medium">Reconnect</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

interface ReconnectingBannerProps {
  countdown: number;
  onReconnect: () => void;
}

export function ReconnectingBanner({ countdown, onReconnect }: ReconnectingBannerProps) {
  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <View className="flex-row items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
        <Clock size={14} color={colors.agentWarning} />
        <View className="flex-1">
          <Text className="text-xs font-semibold text-amber-400 mb-0.5">
            Reconnecting in {countdown}s
          </Text>
          <Text className="text-[11px] text-amber-400/70">Desktop connection lost.</Text>
        </View>
        <Pressable
          onPress={onReconnect}
          className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 active:bg-amber-500/30"
          accessibilityLabel="Reconnect now"
          accessibilityRole="button"
        >
          <RotateCcw size={13} color={colors.agentWarning} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
