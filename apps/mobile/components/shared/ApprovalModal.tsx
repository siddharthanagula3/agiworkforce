import { useState, useCallback } from 'react';
import { View, Modal, Pressable, TextInput, ScrollView } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  Check,
  X,
  ShieldCheck,
  Shield,
  ShieldAlert,
  Terminal,
  FileX,
  Globe,
  Database,
  HelpCircle,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAgentStore } from '@/stores/agentStore';
import { colors } from '@/lib/theme';
import type { ApprovalRequest, RiskLevel } from '@/types/chat';

interface ApprovalModalProps {
  /** The approval request to display. Pass null to hide. */
  approval: ApprovalRequest | null;
  /** Called when user approves the action */
  onApprove: (id: string) => void;
  /** Called when user rejects the action */
  onReject: (id: string, reason?: string) => void;
  /** Called when modal is dismissed (back button, tap outside) */
  onDismiss: () => void;
}

const RISK_CONFIG: Record<RiskLevel, { icon: typeof ShieldCheck; label: string; color: string }> = {
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

/**
 * ApprovalModal -- Full-screen modal for approving/denying tool execution.
 * Designed to be triggered from push notifications or agent status updates.
 * Can be mounted at the root layout and shown from anywhere via props.
 */
export function ApprovalModal({ approval, onApprove, onReject, onDismiss }: ApprovalModalProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const handleApprove = useCallback(() => {
    if (!approval) return;
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onApprove(approval.id);
    setShowRejectInput(false);
    setRejectReason('');
  }, [approval, hapticsEnabled, onApprove]);

  const handleReject = useCallback(() => {
    if (!approval) return;

    if (!showRejectInput) {
      // First tap: show reason input
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      setShowRejectInput(true);
      return;
    }

    // Second tap: confirm rejection
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    onReject(approval.id, rejectReason || undefined);
    setShowRejectInput(false);
    setRejectReason('');
  }, [approval, showRejectInput, rejectReason, hapticsEnabled, onReject]);

  const handleDismiss = useCallback(() => {
    setShowRejectInput(false);
    setRejectReason('');
    onDismiss();
  }, [onDismiss]);

  if (!approval) return null;

  const riskConfig = RISK_CONFIG[approval.riskLevel];
  const RiskIcon = riskConfig.icon;
  const TypeIcon = TYPE_ICONS[approval.type];

  return (
    <Modal
      visible={true}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
        {/* Tap outside to dismiss */}
        <Pressable className="flex-1" onPress={handleDismiss} />

        <Animated.View
          entering={SlideInDown.duration(300).springify()}
          className="rounded-t-3xl overflow-hidden"
          style={{ backgroundColor: colors.surfaceElevated, maxHeight: '80%' }}
        >
          {/* Handle bar */}
          <View className="items-center pt-3 pb-2">
            <View className="w-10 h-1 rounded-full bg-white/20" />
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} bounces={false}>
            {/* Header */}
            <View className="items-center mb-5">
              <View
                className="w-14 h-14 rounded-2xl items-center justify-center mb-3"
                style={{ backgroundColor: `${riskConfig.color}15` }}
              >
                <TypeIcon size={28} color={riskConfig.color} />
              </View>
              <Text className="text-xs uppercase tracking-wider text-white/40 font-medium">
                Approval Required
              </Text>
            </View>

            {/* Risk level + tool name */}
            <View className="flex-row items-center justify-center gap-3 mb-4">
              <View className="flex-row items-center gap-1.5">
                <RiskIcon size={14} color={riskConfig.color} />
                <Text className="text-[13px] font-semibold" style={{ color: riskConfig.color }}>
                  {riskConfig.label}
                </Text>
              </View>
              <Badge label={approval.toolName} color="gray" />
            </View>

            <Separator className="mb-4" />

            {/* Description */}
            <Text className="text-[14px] text-white/80 leading-[20px] text-center mb-6">
              {approval.description}
            </Text>

            {/* Reject reason input */}
            {showRejectInput && (
              <Animated.View entering={FadeIn.duration(200)} className="mb-4">
                <Text className="text-xs text-white/40 mb-2">Rejection reason (optional)</Text>
                <TextInput
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  placeholder="Why are you rejecting this action?"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  multiline
                  maxLength={500}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[13px] min-h-[60px]"
                  autoFocus
                  selectionColor={colors.teal}
                />
              </Animated.View>
            )}

            {/* Action buttons */}
            <View className="gap-3">
              {!showRejectInput && (
                <Pressable
                  onPress={handleApprove}
                  className="flex-row items-center justify-center gap-2 py-4 rounded-2xl active:opacity-80"
                  style={{ backgroundColor: colors.teal }}
                  accessibilityLabel={`Approve ${approval.toolName} action`}
                  accessibilityRole="button"
                >
                  <Check size={18} color="#fff" />
                  <Text className="text-[15px] font-semibold text-white">Approve</Text>
                </Pressable>
              )}

              <Pressable
                onPress={handleReject}
                className="flex-row items-center justify-center gap-2 py-4 rounded-2xl border active:opacity-80"
                style={{
                  borderColor: showRejectInput ? colors.agentError : 'rgba(239,68,68,0.3)',
                  backgroundColor: showRejectInput ? colors.agentError : 'transparent',
                }}
                accessibilityLabel={
                  showRejectInput
                    ? `Confirm rejection of ${approval.toolName}`
                    : `Reject ${approval.toolName} action`
                }
                accessibilityRole="button"
              >
                <X size={18} color={showRejectInput ? '#fff' : colors.agentError} />
                <Text
                  className="text-[15px] font-semibold"
                  style={{ color: showRejectInput ? '#fff' : colors.agentError }}
                >
                  {showRejectInput ? 'Confirm Reject' : 'Reject'}
                </Text>
              </Pressable>

              {showRejectInput && (
                <Pressable
                  onPress={() => {
                    setShowRejectInput(false);
                    setRejectReason('');
                  }}
                  className="items-center py-2"
                  accessibilityLabel="Cancel rejection"
                  accessibilityRole="button"
                >
                  <Text className="text-sm text-white/50">Cancel</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * Hook to manage approval modal state.
 * Returns the currently shown approval and handler functions.
 *
 * Usage:
 *   const { currentApproval, showApproval, handleApprove, handleReject, handleDismiss } = useApprovalModal();
 *   <ApprovalModal approval={currentApproval} onApprove={handleApprove} onReject={handleReject} onDismiss={handleDismiss} />
 */
export function useApprovalModal() {
  const [currentApproval, setCurrentApproval] = useState<ApprovalRequest | null>(null);
  const approveRequest = useAgentStore((s) => s.approveRequest);
  const rejectRequest = useAgentStore((s) => s.rejectRequest);

  const showApproval = useCallback((approval: ApprovalRequest) => {
    setCurrentApproval(approval);
  }, []);

  const handleApprove = useCallback(
    (id: string) => {
      approveRequest(id);
      setCurrentApproval(null);
    },
    [approveRequest],
  );

  const handleReject = useCallback(
    (id: string, reason?: string) => {
      rejectRequest(id, reason);
      setCurrentApproval(null);
    },
    [rejectRequest],
  );

  const handleDismiss = useCallback(() => {
    setCurrentApproval(null);
  }, []);

  return {
    currentApproval,
    showApproval,
    handleApprove,
    handleReject,
    handleDismiss,
  };
}
