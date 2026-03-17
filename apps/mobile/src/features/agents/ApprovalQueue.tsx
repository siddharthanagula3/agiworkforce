/**
 * ApprovalQueue — Dedicated view for pending tool execution approvals.
 *
 * Features:
 * - Lists all pending approval requests from desktop agents
 * - One-tap approve/deny with haptic feedback
 * - Risk level color coding (low/medium/high)
 * - Tool name, arguments, and description display
 * - Push notification integration — sends local notification for new approvals
 * - Empty state when no approvals are pending
 * - Auto-dismisses resolved approvals with animation
 */

import { useCallback, useEffect, useRef } from 'react';
import { View, Pressable } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  LinearTransition,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  Terminal,
  FileText,
  Globe,
  Database,
  AlertTriangle,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAgentStore } from '@/stores/agentStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';
import type { ApprovalRequest, RiskLevel } from '@/types/chat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApprovalQueueProps {
  /** Optional header component */
  header?: React.ReactElement;
  /** Called when all approvals are resolved */
  onAllResolved?: () => void;
}

// ---------------------------------------------------------------------------
// Risk level configuration
// ---------------------------------------------------------------------------

const RISK_CONFIG: Record<
  RiskLevel,
  {
    icon: typeof ShieldAlert;
    borderColor: string;
    bgColor: string;
    badgeColor: 'green' | 'yellow' | 'red';
    label: string;
  }
> = {
  low: {
    icon: ShieldCheck,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    bgColor: 'rgba(16, 185, 129, 0.06)',
    badgeColor: 'green',
    label: 'Low Risk',
  },
  medium: {
    icon: Shield,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    bgColor: 'rgba(245, 158, 11, 0.06)',
    badgeColor: 'yellow',
    label: 'Medium Risk',
  },
  high: {
    icon: ShieldAlert,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    bgColor: 'rgba(239, 68, 68, 0.06)',
    badgeColor: 'red',
    label: 'High Risk',
  },
};

/** Map approval type to an icon */
function getTypeIcon(type: ApprovalRequest['type']) {
  switch (type) {
    case 'command':
      return Terminal;
    case 'file_delete':
      return FileText;
    case 'api_call':
      return Globe;
    case 'data_modification':
      return Database;
    default:
      return AlertTriangle;
  }
}

// ---------------------------------------------------------------------------
// Approval Card
// ---------------------------------------------------------------------------

interface ApprovalCardProps {
  request: ApprovalRequest;
}

function ApprovalCardItem({ request }: ApprovalCardProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const approveRequest = useAgentStore((s) => s.approveRequest);
  const rejectRequest = useAgentStore((s) => s.rejectRequest);

  const risk = RISK_CONFIG[request.riskLevel];
  const RiskIcon = risk.icon;
  const TypeIcon = getTypeIcon(request.type);

  const handleApprove = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    approveRequest(request.id);
  }, [request.id, hapticsEnabled, approveRequest]);

  const handleReject = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    rejectRequest(request.id);
  }, [request.id, hapticsEnabled, rejectRequest]);

  // Already resolved — show brief confirmation
  if (request.status !== 'pending') {
    return (
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(200)}
        layout={LinearTransition.springify()}
      >
        <Card variant="default" className="flex-row items-center gap-3 opacity-60">
          {request.status === 'approved' ? (
            <CheckCircle2 size={18} color={colors.agentSuccess} />
          ) : (
            <XCircle size={18} color={colors.agentError} />
          )}
          <Text className="text-xs text-white/60 flex-1">
            {request.toolName} — {request.status === 'approved' ? 'Approved' : 'Rejected'}
          </Text>
        </Card>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={SlideInRight.duration(250).springify()}
      exiting={SlideOutLeft.duration(200)}
      layout={LinearTransition.springify()}
    >
      <Card
        variant="elevated"
        className="border"
        style={{
          borderColor: risk.borderColor,
          backgroundColor: risk.bgColor,
        }}
      >
        {/* Header: risk icon + tool name + badges */}
        <View className="flex-row items-center gap-2.5 mb-3">
          <View
            className="w-8 h-8 rounded-lg items-center justify-center"
            style={{ backgroundColor: `${risk.borderColor}40` }}
          >
            <RiskIcon size={16} color={risk.borderColor.replace('0.3', '1')} />
          </View>

          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                {request.toolName}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <TypeIcon size={10} color={colors.textMuted} />
              <Text className="text-[10px] text-white/40 uppercase tracking-wider">
                {request.type.replace('_', ' ')}
              </Text>
            </View>
          </View>

          <Badge label={risk.label} color={risk.badgeColor} />
        </View>

        {/* Description */}
        <Text className="text-xs text-white/70 mb-4 leading-4" numberOfLines={4}>
          {request.description}
        </Text>

        {/* Countdown timer (if present) */}
        {request.countdown != null && request.countdown > 0 && (
          <View className="flex-row items-center gap-1.5 mb-3">
            <Clock size={12} color={colors.agentWarning} />
            <Text className="text-[10px] text-amber-400">
              Auto-approves in {request.countdown}s
            </Text>
          </View>
        )}

        <Separator className="mb-3" />

        {/* Action buttons */}
        <View className="flex-row gap-3">
          <Pressable
            onPress={handleApprove}
            className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/20 active:bg-emerald-500/30"
            accessibilityLabel={`Approve ${request.toolName}`}
            accessibilityRole="button"
          >
            <CheckCircle2 size={16} color={colors.agentSuccess} />
            <Text className="text-sm font-semibold text-emerald-400">Approve</Text>
          </Pressable>

          <Pressable
            onPress={handleReject}
            className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 active:bg-red-500/20"
            accessibilityLabel={`Deny ${request.toolName}`}
            accessibilityRole="button"
          >
            <XCircle size={16} color={colors.agentError} />
            <Text className="text-sm font-semibold text-red-400">Deny</Text>
          </Pressable>
        </View>
      </Card>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ApprovalQueue({ header, onAllResolved }: ApprovalQueueProps) {
  const pendingApprovals = useAgentStore((s) => s.pendingApprovals);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const prevCountRef = useRef(0);

  // Filter to pending only for the queue
  const pendingOnly = pendingApprovals.filter((r) => r.status === 'pending');
  const recentResolved = pendingApprovals.filter((r) => r.status !== 'pending').slice(-3); // Show last 3 resolved

  // Send push notification when new approval arrives
  useEffect(() => {
    const currentPendingCount = pendingOnly.length;
    const prevCount = prevCountRef.current;
    prevCountRef.current = currentPendingCount;

    // New approval arrived
    if (currentPendingCount > prevCount && notificationsEnabled && currentPendingCount > 0) {
      const newest = pendingOnly[pendingOnly.length - 1];
      if (newest) {
        scheduleApprovalNotification(newest);
      }
    }

    // All resolved
    if (currentPendingCount === 0 && prevCount > 0) {
      onAllResolved?.();
    }
  }, [pendingOnly.length, notificationsEnabled, onAllResolved, pendingOnly]);

  if (pendingOnly.length === 0 && recentResolved.length === 0) {
    return (
      <Animated.View
        entering={FadeIn.duration(200)}
        className="flex-1 items-center justify-center px-8 py-12"
      >
        <View className="w-16 h-16 rounded-2xl bg-emerald-500/10 items-center justify-center mb-4">
          <ShieldCheck size={28} color={colors.agentSuccess} />
        </View>
        <Text className="text-white/60 text-center text-sm">No pending approvals</Text>
        <Text className="text-white/40 text-center text-xs mt-1">
          Tool executions requiring your approval will appear here.
        </Text>
      </Animated.View>
    );
  }

  const allItems = [...pendingOnly, ...recentResolved];

  return (
    <FlashList
      data={allItems}
      keyExtractor={(item) => item.id}
      estimatedItemSize={180}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListHeaderComponent={
        header ?? (
          <View className="flex-row items-center justify-between py-3">
            <Text className="text-xs text-white/50 uppercase tracking-wider">Approval Queue</Text>
            {pendingOnly.length > 0 && (
              <Badge
                label={`${pendingOnly.length} pending`}
                color={pendingOnly.some((r) => r.riskLevel === 'high') ? 'red' : 'yellow'}
              />
            )}
          </View>
        )
      }
      renderItem={({ item }) => <ApprovalCardItem request={item} />}
    />
  );
}

// ---------------------------------------------------------------------------
// Push Notification Helper
// ---------------------------------------------------------------------------

/**
 * Schedule a local push notification for a new approval request.
 * Uses the 'agent-approvals' channel on Android for high-priority delivery.
 */
async function scheduleApprovalNotification(request: ApprovalRequest): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: request.riskLevel === 'high' ? 'Approval Required' : 'Agent Needs Approval',
        body: `${request.toolName}: ${request.description}`.slice(0, 200),
        data: {
          type: 'agent_approval_needed',
          approvalId: request.id,
          route: '/(app)/companion',
        },
        sound: request.riskLevel === 'high' ? 'default' : undefined,
        priority:
          request.riskLevel === 'high'
            ? Notifications.AndroidNotificationPriority.MAX
            : Notifications.AndroidNotificationPriority.HIGH,
        categoryIdentifier: 'approval',
      },
      trigger: null, // Immediate delivery
    });
  } catch (err) {
    console.warn('[ApprovalQueue] Failed to schedule notification:', err);
  }
}
