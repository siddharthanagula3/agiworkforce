import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Pressable, TextInput } from 'react-native';
import Animated, {
  FadeInDown,
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
import { colors } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ApprovalRequest, RiskLevel } from '@/types/chat';

interface ApprovalCardProps {
  approval: ApprovalRequest;
  onApprove: (id: string) => void;
  onReject: (id: string, reason?: string) => void;
}

const RISK_BORDER_COLOR: Record<RiskLevel, string> = {
  low: colors.agentSuccess,
  medium: colors.agentWarning,
  high: colors.agentError,
};

const RISK_CONFIG: Record<
  RiskLevel,
  { icon: typeof ShieldCheck; label: string; color: string }
> = {
  low: { icon: ShieldCheck, label: 'Low Risk', color: colors.agentSuccess },
  medium: { icon: Shield, label: 'Medium Risk', color: colors.agentWarning },
  high: { icon: ShieldAlert, label: 'High Risk', color: colors.agentError },
};

const TYPE_ICONS: Record<ApprovalRequest['type'], typeof Terminal> = {
  file_delete: FileX,
  command: Terminal,
  api_call: Globe,
  data_modification: Database,
  other: HelpCircle,
};

export function ApprovalCard({ approval, onApprove, onReject }: ApprovalCardProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const autoApproveMode = useSettingsStore((s) => s.autoApproveMode);

  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [countdown, setCountdown] = useState<number | null>(
    autoApproveMode === 'smart' && approval.countdown != null
      ? approval.countdown
      : null,
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownProgress = useSharedValue(countdown != null ? 1 : 0);

  const isPending = approval.status === 'pending';
  const isResolved = approval.status === 'approved' || approval.status === 'rejected';

  const riskConfig = RISK_CONFIG[approval.riskLevel];
  const RiskIcon = riskConfig.icon;
  const TypeIcon = TYPE_ICONS[approval.type];
  const borderColor = RISK_BORDER_COLOR[approval.riskLevel];

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
          onApprove(approval.id);
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
  }, [isPending, approval.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Second tap: confirm rejection
      if (hapticsEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      onReject(approval.id, rejectReason || undefined);
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
    <Animated.View entering={FadeInDown.duration(300).springify()}>
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
          <View
            className="p-1.5 rounded-lg"
            style={{ backgroundColor: `${riskConfig.color}15` }}
          >
            <TypeIcon size={16} color={riskConfig.color} />
          </View>

          <View className="flex-1">
            <Text className="text-[10px] uppercase tracking-wider text-white/40 font-medium">
              Approval Required
            </Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <RiskIcon size={12} color={riskConfig.color} />
              <Text className="text-[12px] font-semibold" style={{ color: riskConfig.color }}>
                {riskConfig.label}
              </Text>
            </View>
          </View>

          {/* Tool name badge */}
          <View className="bg-white/8 px-2 py-0.5 rounded-full">
            <Text variant="caption" className="text-white/50 text-[10px]">
              {approval.toolName}
            </Text>
          </View>
        </View>

        {/* Description */}
        <View className="px-3 py-2">
          <Text className="text-[13px] text-white/80 leading-[18px]">
            {approval.description}
          </Text>
        </View>

        {/* Countdown bar (smart auto mode) */}
        {countdown != null && countdown > 0 && isPending ? (
          <View className="px-3 pb-2">
            <View className="flex-row items-center gap-2 mb-1">
              <Text variant="caption" className="text-white/40 text-[10px]">
                Auto-approving in {countdown}s
              </Text>
            </View>
            <View className="h-1 bg-white/10 rounded-full overflow-hidden">
              <Animated.View
                className="h-full rounded-full"
                style={[{ backgroundColor: colors.agentWarning }, countdownBarStyle]}
              />
            </View>
          </View>
        ) : null}

        {/* Resolved overlay */}
        {isResolved ? (
          <View className="flex-row items-center justify-center gap-2 px-3 py-3 bg-white/5">
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
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-[13px]"
                  placeholder="Reason for rejection (optional)"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  autoFocus
                  selectionColor={colors.teal}
                />
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={handleRejectPress}
                    className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-lg bg-red-500/90 active:bg-red-600"
                  >
                    <X size={14} color="#fff" />
                    <Text className="text-[13px] font-semibold text-white">
                      Confirm Reject
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleCancelReject}
                    className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-lg bg-white/10 active:bg-white/15"
                  >
                    <Text className="text-[13px] font-medium text-white/70">Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="flex-row gap-2">
                <Pressable
                  onPress={handleApprove}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl active:opacity-80"
                  style={{ backgroundColor: colors.teal }}
                >
                  <Check size={16} color="#fff" />
                  <Text className="text-[13px] font-semibold text-white">Approve</Text>
                </Pressable>
                <Pressable
                  onPress={handleRejectPress}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl border active:opacity-80"
                  style={{ borderColor: colors.agentError }}
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
