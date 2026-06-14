import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Pressable, TextInput } from 'react-native';
import Animated, {
  FadeInDown,
  useReducedMotion,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  Check,
  X,
  FileX,
  Terminal,
  Globe,
  Database,
  HelpCircle,
  ShieldCheck,
  Shield,
  ShieldAlert,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ApprovalRequest, RiskLevel } from '@/types/chat';

interface ApprovalCardProps {
  approval: ApprovalRequest;
  onApprove: (id: string) => void;
  onReject: (id: string, reason?: string) => void;
}

const RISK_CONFIG: Record<
  RiskLevel,
  {
    icon: typeof ShieldCheck;
    label: string;
    colorToken: 'agentSuccess' | 'agentWarning' | 'agentError';
    surfaceToken: 'successSurface' | 'warningSurface' | 'dangerSurface';
  }
> = {
  low: {
    icon: ShieldCheck,
    label: 'Low Risk',
    colorToken: 'agentSuccess',
    surfaceToken: 'successSurface',
  },
  medium: {
    icon: Shield,
    label: 'Medium Risk',
    colorToken: 'agentWarning',
    surfaceToken: 'warningSurface',
  },
  high: {
    icon: ShieldAlert,
    label: 'High Risk',
    colorToken: 'agentError',
    surfaceToken: 'dangerSurface',
  },
};

const TYPE_ICONS: Record<ApprovalRequest['type'], typeof Terminal> = {
  file_delete: FileX,
  command: Terminal,
  api_call: Globe,
  data_modification: Database,
  other: HelpCircle,
};

export function ApprovalCard({ approval, onApprove, onReject }: ApprovalCardProps) {
  const reducedMotion = useReducedMotion();
  const colors = useThemeColors();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const autoApproveMode = useSettingsStore((s) => s.autoApproveMode);

  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [countdown, setCountdown] = useState<number | null>(
    autoApproveMode === 'smart' && approval.countdown != null ? approval.countdown : null,
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onApproveRef = useRef(onApprove);
  onApproveRef.current = onApprove;
  const countdownProgress = useSharedValue(countdown != null ? 1 : 0);

  const isPending = approval.status === 'pending';
  const isResolved = approval.status === 'approved' || approval.status === 'rejected';

  const riskConfig = RISK_CONFIG[approval.riskLevel];
  const RiskIcon = riskConfig.icon;
  const TypeIcon = TYPE_ICONS[approval.type];
  const riskColor = colors[riskConfig.colorToken];
  const riskSurface = colors[riskConfig.surfaceToken];
  const borderColor = riskColor;

  // Countdown timer for smart auto-approve
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isPending || countdown == null || countdown <= 0) return;

    const totalSeconds = countdown;
    countdownProgress.value = withTiming(0, {
      duration: totalSeconds * 1000,
      easing: Easing.linear,
    });

    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev == null || prev <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          // Auto-approve on timeout
          onApproveRef.current(approval.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPending, approval.id, countdown, countdownProgress]);

  const countdownBarStyle = useAnimatedStyle(() => ({
    width: `${countdownProgress.value * 100}%`,
  }));

  const handleApprove = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onApprove(approval.id);
  }, [approval.id, hapticsEnabled, onApprove]);

  const handleRejectPress = useCallback(() => {
    if (showRejectInput) {
      // Second tap: confirm rejection — stop countdown to prevent auto-approve after reject
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (hapticsEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      onReject(approval.id, rejectReason.trim() || undefined);
      setShowRejectInput(false);
      setRejectReason('');
    } else {
      // First tap: show reason input
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      setShowRejectInput(true);
    }
  }, [showRejectInput, rejectReason, approval.id, hapticsEnabled, onReject]);

  const handleCancelReject = useCallback(() => {
    setShowRejectInput(false);
    setRejectReason('');
  }, []);

  return (
    <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(300).springify()}>
      <View
        className="rounded-xl overflow-hidden my-1"
        style={{
          backgroundColor: colors.surfaceOverlay,
          borderLeftWidth: 3,
          borderLeftColor: borderColor,
          opacity: isResolved ? 0.6 : 1,
        }}
      >
        {/* Header row */}
        <View className="flex-row items-center gap-2.5 px-3 pt-3 pb-1">
          <View className="p-1.5 rounded-lg" style={{ backgroundColor: riskSurface }}>
            <TypeIcon size={16} color={riskColor} />
          </View>

          <View className="flex-1">
            <Text
              className="text-[10px] uppercase tracking-wider font-medium"
              style={{ color: colors.textMuted }}
            >
              Approval Required
            </Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <RiskIcon size={12} color={riskColor} />
              <Text className="text-[12px] font-semibold" style={{ color: riskColor }}>
                {riskConfig.label}
              </Text>
            </View>
          </View>

          {/* Tool name badge */}
          <View
            className="px-2 py-0.5 rounded-full"
            style={{ backgroundColor: colors.neutralSurface }}
          >
            <Text variant="caption" className="text-[10px]" style={{ color: colors.textMuted }}>
              {approval.toolName}
            </Text>
          </View>
        </View>

        {/* Description */}
        <View className="px-3 py-2">
          <Text className="text-[13px] leading-[18px]" style={{ color: colors.textSecondary }}>
            {approval.description}
          </Text>
        </View>

        {/* Countdown bar (smart auto mode) */}
        {countdown != null && countdown > 0 && isPending ? (
          <View className="px-3 pb-2">
            <View className="flex-row items-center gap-2 mb-1">
              <Text variant="caption" className="text-[10px]" style={{ color: colors.textMuted }}>
                Auto-approving in {countdown}s
              </Text>
            </View>
            <View
              className="h-1 rounded-full overflow-hidden"
              style={{ backgroundColor: colors.progressTrack }}
            >
              <Animated.View
                className="h-full rounded-full"
                style={[{ backgroundColor: colors.agentWarning }, countdownBarStyle]}
              />
            </View>
          </View>
        ) : null}

        {/* Resolved overlay */}
        {isResolved ? (
          <View
            className="flex-row items-center justify-center gap-2 px-3 py-3"
            style={{ backgroundColor: colors.neutralSurface }}
          >
            {approval.status === 'approved' ? (
              <>
                <Check size={16} color={colors.agentSuccess} />
                <Text className="text-[13px] font-medium" style={{ color: colors.agentSuccess }}>
                  Approved
                </Text>
              </>
            ) : (
              <>
                <X size={16} color={colors.agentError} />
                <Text className="text-[13px] font-medium" style={{ color: colors.agentError }}>
                  Rejected
                </Text>
              </>
            )}
          </View>
        ) : null}

        {/* Action buttons (only when pending) */}
        {isPending ? (
          <View className="px-3 pb-3">
            {showRejectInput ? (
              <View className="gap-2">
                <TextInput
                  className="rounded-lg px-3 py-2 text-[13px]"
                  placeholder="Reason for rejection (optional)"
                  placeholderTextColor={colors.textMuted}
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  autoFocus
                  selectionColor={colors.teal}
                  style={{
                    backgroundColor: colors.inputSurface,
                    borderColor: colors.border,
                    borderWidth: 1,
                    color: colors.textPrimary,
                  }}
                />
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={handleRejectPress}
                    className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-lg"
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? colors.dangerBorder : colors.agentError,
                    })}
                    accessible={true}
                    accessibilityLabel="Confirm rejection"
                    accessibilityRole="button"
                  >
                    <X size={14} color={colors.accentText} />
                    <Text
                      className="text-[13px] font-semibold"
                      style={{ color: colors.accentText }}
                    >
                      Confirm Reject
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleCancelReject}
                    className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-lg"
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? colors.surfaceHover : colors.neutralSurface,
                    })}
                    accessible={true}
                    accessibilityLabel="Cancel rejection"
                    accessibilityRole="button"
                  >
                    <Text
                      className="text-[13px] font-medium"
                      style={{ color: colors.textSecondary }}
                    >
                      Cancel
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="flex-row gap-2">
                <Pressable
                  onPress={handleApprove}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl active:opacity-80"
                  style={{ backgroundColor: colors.teal }}
                  accessible={true}
                  accessibilityLabel={`Approve ${approval.toolName} action`}
                  accessibilityRole="button"
                >
                  <Check size={16} color={colors.accentText} />
                  <Text className="text-[13px] font-semibold" style={{ color: colors.accentText }}>
                    Approve
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleRejectPress}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl border active:opacity-80"
                  style={{ borderColor: colors.agentError }}
                  accessible={true}
                  accessibilityLabel={`Reject ${approval.toolName} action`}
                  accessibilityRole="button"
                >
                  <X size={16} color={colors.agentError} />
                  <Text className="text-[13px] font-semibold" style={{ color: colors.agentError }}>
                    Reject
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}
