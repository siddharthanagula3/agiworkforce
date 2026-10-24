import Animated, { FadeIn } from 'react-native-reanimated';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { AlertTriangle, SignalZero, Clock, RotateCcw } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useThemeColors, motion } from '@/src/ui/theme';
import { formatRelativeTime } from '@/src/lib/time';

const STALE_THRESHOLD_MS = 90_000;

export function formatLastSeen(lastSeenAt: number): string {
  return `Last seen ${formatRelativeTime(new Date(lastSeenAt).toISOString())}`;
}

export function offlineStatusLine(lastSeenAt: number | null): string {
  return lastSeenAt === null ? 'Offline' : `Offline · ${formatLastSeen(lastSeenAt)}`;
}

interface StaleApprovalBannerProps {
  lastHeartbeatAt: number;
}

export function StaleApprovalBanner({ lastHeartbeatAt }: StaleApprovalBannerProps) {
  const colors = useThemeColors();
  const ageMs = Date.now() - lastHeartbeatAt;
  if (ageMs < STALE_THRESHOLD_MS) return null;

  const ageSeconds = Math.floor(ageMs / 1000);
  const ageLabel = ageSeconds >= 60 ? `${Math.floor(ageSeconds / 60)}m ago` : `${ageSeconds}s ago`;

  return (
    <Animated.View entering={FadeIn.duration(motion.moved)} className="mx-4 mb-3">
      <View className="flex-row items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
        <AlertTriangle size={14} color={colors.agentWarning} style={{ marginTop: 1 }} />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-amber-400 mb-0.5">
            Approval may be outdated
          </Text>
          <Text className="text-sm text-amber-400/70 leading-5">
            Last desktop contact {ageLabel}. The desktop may have moved on.
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

interface DisconnectedDesktopBannerProps {
  onReconnect: () => void;
  lastSeenAt?: number | null;
}

export function DisconnectedDesktopBanner({
  onReconnect,
  lastSeenAt = null,
}: DisconnectedDesktopBannerProps) {
  const colors = useThemeColors();
  return (
    <Animated.View entering={FadeIn.duration(motion.moved)}>
      <View className="flex-row items-center gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/25">
        <SignalZero size={14} color={colors.agentError} />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-red-400 mb-0.5">Desktop unreachable</Text>
          <Text className="text-sm text-red-400/70">
            {lastSeenAt === null
              ? 'Reconnecting automatically.'
              : `${formatLastSeen(lastSeenAt)}. Reconnecting automatically.`}
          </Text>
        </View>
        <PressableBox
          onPress={onReconnect}
          className="px-3 rounded-lg bg-red-500/20 active:bg-red-500/30"
          style={{ minHeight: 44, justifyContent: 'center' }}
          accessibilityLabel="Reconnect to desktop"
          accessibilityRole="button"
        >
          <Text className="text-sm text-red-400 font-medium">Reconnect</Text>
        </PressableBox>
      </View>
    </Animated.View>
  );
}

interface ReconnectingBannerProps {
  countdown: number;
  onReconnect: () => void;
}

export function ReconnectingBanner({ countdown, onReconnect }: ReconnectingBannerProps) {
  const colors = useThemeColors();
  return (
    <Animated.View entering={FadeIn.duration(motion.moved)}>
      <View className="flex-row items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
        <Clock size={14} color={colors.agentWarning} />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-amber-400 mb-0.5">
            Reconnecting in {countdown}s
          </Text>
          <Text className="text-sm text-amber-400/70">Desktop connection lost.</Text>
        </View>
        <PressableBox
          onPress={onReconnect}
          className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 active:bg-amber-500/30"
          accessibilityLabel="Reconnect now"
          accessibilityRole="button"
        >
          <RotateCcw size={13} color={colors.agentWarning} />
        </PressableBox>
      </View>
    </Animated.View>
  );
}
