import { useCallback, useEffect } from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  FadeIn,
  FadeOut,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Monitor, QrCode, ChevronRight, Bot, ShieldAlert, Smartphone } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConnectionStore } from '@/stores/connectionStore';
import { useAgentStore } from '@/stores/agentStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';

export interface DesktopCompanionWidgetProps {
  /** When true, renders a compact single-row variant for the home screen.
   *  When false (default), renders the full card with expanded info. */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Pulse animation hook — drives the live connection indicator dot
// ---------------------------------------------------------------------------

function usePulseAnimation() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.9);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 900, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 700, easing: Easing.in(Easing.ease) }),
      ),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 900, easing: Easing.out(Easing.ease) }),
        withTiming(0.9, { duration: 700, easing: Easing.in(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return animatedStyle;
}

// ---------------------------------------------------------------------------
// Connected State Widget
// ---------------------------------------------------------------------------

interface ConnectedWidgetProps {
  compact: boolean;
  onPressDashboard: () => void;
  onPressApprovals: () => void;
}

function ConnectedWidget({ compact, onPressDashboard, onPressApprovals }: ConnectedWidgetProps) {
  const desktopName = useConnectionStore((s) => s.desktopName);
  const desktopMetadata = useConnectionStore((s) => s.desktopMetadata);
  const activeAgents = useAgentStore((s) =>
    s.agents.filter((a) => a.status === 'running' || a.status === 'waiting'),
  );
  const pendingApprovals = useAgentStore((s) =>
    s.pendingApprovals.filter((r) => r.status === 'pending'),
  );

  const pulseStyle = usePulseAnimation();

  const displayName = desktopName ?? 'Desktop';
  const platformLabel = desktopMetadata?.platform
    ? String(desktopMetadata.platform)
    : desktopMetadata?.os
      ? String(desktopMetadata.os)
      : null;

  if (compact) {
    return (
      <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)}>
        <Pressable
          onPress={onPressDashboard}
          accessibilityLabel={`Connected to ${displayName}. Tap to view dashboard.`}
          accessibilityRole="button"
        >
          <Card variant="outline" className="border-teal-500/25">
            <View className="flex-row items-center gap-3">
              {/* Connection indicator */}
              <View className="w-10 h-10 rounded-xl bg-teal-500/15 items-center justify-center">
                <View className="relative items-center justify-center">
                  <Animated.View
                    style={[pulseStyle]}
                    className="absolute w-5 h-5 rounded-full bg-teal-500/25"
                  />
                  <View className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                </View>
              </View>

              {/* Info */}
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-medium text-white">{displayName}</Text>
                  {platformLabel && <Badge label={platformLabel} color="teal" />}
                </View>
                <View className="flex-row items-center gap-3 mt-0.5">
                  {activeAgents.length > 0 && (
                    <View className="flex-row items-center gap-1">
                      <Bot size={10} color={colors.agentActive} />
                      <Text className="text-[11px] text-blue-400">
                        {activeAgents.length} active
                      </Text>
                    </View>
                  )}
                  {pendingApprovals.length > 0 && (
                    <View className="flex-row items-center gap-1">
                      <ShieldAlert size={10} color={colors.agentWarning} />
                      <Text className="text-[11px] text-amber-400">
                        {pendingApprovals.length} pending
                      </Text>
                    </View>
                  )}
                  {activeAgents.length === 0 && pendingApprovals.length === 0 && (
                    <Text className="text-[11px] text-teal-500/70">Connected</Text>
                  )}
                </View>
              </View>

              {/* Right actions */}
              <View className="flex-row items-center gap-2">
                {pendingApprovals.length > 0 && (
                  <Pressable
                    onPress={onPressApprovals}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 active:bg-amber-500/25"
                    accessibilityLabel={`${pendingApprovals.length} pending approvals`}
                    accessibilityRole="button"
                  >
                    <View className="flex-row items-center gap-1">
                      <Text className="text-[11px] font-semibold text-amber-400">
                        {pendingApprovals.length}
                      </Text>
                      <ShieldAlert size={11} color={colors.agentWarning} />
                    </View>
                  </Pressable>
                )}
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </View>
          </Card>
        </Pressable>
      </Animated.View>
    );
  }

  // Full (non-compact) variant
  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)}>
      <Card variant="outline" className="border-teal-500/25">
        {/* Header row */}
        <View className="flex-row items-center gap-3 mb-3">
          <View className="w-10 h-10 rounded-xl bg-teal-500/15 items-center justify-center">
            <View className="relative items-center justify-center">
              <Animated.View
                style={[pulseStyle]}
                className="absolute w-5 h-5 rounded-full bg-teal-500/25"
              />
              <View className="w-2.5 h-2.5 rounded-full bg-teal-500" />
            </View>
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Monitor size={14} color={colors.teal} />
              <Text className="text-sm font-medium text-white">{displayName}</Text>
            </View>
            {platformLabel && (
              <Text className="text-[11px] text-white/40 mt-0.5">{platformLabel}</Text>
            )}
          </View>
          <Badge label="Live" color="teal" />
        </View>

        {/* Stats row */}
        <View className="flex-row gap-3 mb-3">
          <View className="flex-1 bg-white/5 rounded-lg p-2.5">
            <View className="flex-row items-center gap-1.5 mb-0.5">
              <Bot size={12} color={colors.agentActive} />
              <Text className="text-[10px] text-white/50 uppercase tracking-wide">Agents</Text>
            </View>
            <Text className="text-lg font-bold text-blue-400">{activeAgents.length}</Text>
            <Text className="text-[10px] text-white/30">active</Text>
          </View>
          <View
            className="flex-1 rounded-lg p-2.5"
            style={{
              backgroundColor:
                pendingApprovals.length > 0
                  ? 'rgba(245, 158, 11, 0.08)'
                  : 'rgba(255, 255, 255, 0.03)',
            }}
          >
            <View className="flex-row items-center gap-1.5 mb-0.5">
              <ShieldAlert
                size={12}
                color={pendingApprovals.length > 0 ? colors.agentWarning : colors.textMuted}
              />
              <Text className="text-[10px] text-white/50 uppercase tracking-wide">Approvals</Text>
            </View>
            <Text
              className="text-lg font-bold"
              style={{
                color: pendingApprovals.length > 0 ? colors.agentWarning : colors.textMuted,
              }}
            >
              {pendingApprovals.length}
            </Text>
            <Text className="text-[10px] text-white/30">pending</Text>
          </View>
        </View>

        {/* Action buttons */}
        <View className="flex-row gap-2">
          {pendingApprovals.length > 0 && (
            <Pressable
              onPress={onPressApprovals}
              className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-lg bg-amber-500/15 active:bg-amber-500/25"
              accessibilityLabel={`Review ${pendingApprovals.length} pending approval${pendingApprovals.length > 1 ? 's' : ''}`}
              accessibilityRole="button"
            >
              <ShieldAlert size={14} color={colors.agentWarning} />
              <Text className="text-xs font-medium text-amber-400">
                Approve ({pendingApprovals.length})
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={onPressDashboard}
            className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-lg bg-teal-500/15 active:bg-teal-500/25"
            accessibilityLabel="View agent dashboard"
            accessibilityRole="button"
          >
            <Monitor size={14} color={colors.teal} />
            <Text className="text-xs font-medium text-teal-400">View Dashboard</Text>
          </Pressable>
        </View>
      </Card>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Disconnected State Widget
// ---------------------------------------------------------------------------

interface DisconnectedWidgetProps {
  compact: boolean;
  onPress: () => void;
}

function DisconnectedWidget({ compact, onPress }: DisconnectedWidgetProps) {
  const desktopName = useConnectionStore((s) => s.desktopName);

  if (compact) {
    return (
      <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)}>
        <Pressable
          onPress={onPress}
          accessibilityLabel="Connect to desktop. Tap to scan QR code."
          accessibilityRole="button"
        >
          <Card variant="outline" className="border-teal-500/20">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-teal-500/10 items-center justify-center">
                <QrCode size={20} color={colors.teal} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-white">Connect to Desktop</Text>
                <Text className="text-xs text-white/40 mt-0.5">
                  {desktopName
                    ? `Last: ${desktopName} — scan QR to reconnect`
                    : 'Scan QR to control agents from your phone'}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </View>
          </Card>
        </Pressable>
      </Animated.View>
    );
  }

  // Full variant
  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)}>
      <Pressable
        onPress={onPress}
        accessibilityLabel="Connect to desktop. Tap to scan QR code."
        accessibilityRole="button"
      >
        <Card variant="outline" className="border-teal-500/20">
          {/* QR illustration row */}
          <View className="items-center py-2 mb-3">
            <View className="w-14 h-14 rounded-2xl bg-teal-500/10 items-center justify-center mb-3">
              <Smartphone size={26} color={colors.teal} />
            </View>
            <Text className="text-sm font-semibold text-white mb-1">Connect to Desktop</Text>
            <Text className="text-xs text-white/40 text-center leading-relaxed px-4">
              Pair with the AGI Workforce desktop app to monitor and control agents from your phone.
            </Text>
            {desktopName && (
              <View className="mt-2 flex-row items-center gap-1.5">
                <View className="w-1.5 h-1.5 rounded-full bg-white/30" />
                <Text className="text-[11px] text-white/40">Last connected: {desktopName}</Text>
              </View>
            )}
          </View>

          {/* CTA */}
          <View className="flex-row items-center justify-center gap-2 py-2.5 rounded-lg bg-teal-500/15 active:bg-teal-500/25">
            <QrCode size={15} color={colors.teal} />
            <Text className="text-sm font-medium text-teal-400">Scan QR Code</Text>
          </View>
        </Card>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * DesktopCompanionWidget
 *
 * Displays the current desktop connection state as a rich interactive card.
 * - Connected: desktop name, platform, active agent count, pending approvals, dashboard CTA.
 * - Disconnected: QR scan prompt with last-connected hint.
 *
 * @param compact - When true renders a compact single-row card (suited for the home screen).
 *                  When false (default) renders the full expanded card.
 */
export function DesktopCompanionWidget({ compact = false }: DesktopCompanionWidgetProps) {
  const router = useRouter();
  const status = useConnectionStore((s) => s.status);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const handleOpenCompanion = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/(app)/companion' as Parameters<typeof router.push>[0]);
  }, [hapticsEnabled, router]);

  const handleOpenApprovals = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push('/(app)/companion' as Parameters<typeof router.push>[0]);
  }, [hapticsEnabled, router]);

  const isConnected = status === 'connected';

  if (isConnected) {
    return (
      <ConnectedWidget
        compact={compact}
        onPressDashboard={handleOpenCompanion}
        onPressApprovals={handleOpenApprovals}
      />
    );
  }

  return <DisconnectedWidget compact={compact} onPress={handleOpenCompanion} />;
}
