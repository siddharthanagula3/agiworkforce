import { useCallback } from 'react';
import { View, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Play,
  Square,
  Pause,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AgentStatusBadge } from '@/components/agents/AgentStatusBadge';
import { ToolTimeline } from '@/components/agents/ToolTimeline';
import { useAgentStore } from '@/stores/agentStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/stores/modelStore';
import { colors } from '@/lib/theme';
import { sendAgentCommand, sendApprovalResponse, getRiskBadgeColor } from '@/services/companion';
import type { ApprovalRequest, StatusStep, ToolCall } from '@/types/chat';

// ---------------------------------------------------------------------------
// Progress Bar
// ---------------------------------------------------------------------------

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, progress));
  return (
    <View
      style={{
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${clamped}%`,
          height: '100%',
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Status step row
// ---------------------------------------------------------------------------

function StepRow({ step, index }: { step: StatusStep; index: number }) {
  const dotColor =
    step.status === 'completed'
      ? colors.agentSuccess
      : step.status === 'failed'
        ? colors.agentError
        : colors.agentActive;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).duration(200)}
      style={{ flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}
    >
      <View style={{ marginTop: 5 }}>
        {step.status === 'completed' ? (
          <CheckCircle2 size={12} color={colors.agentSuccess} />
        ) : step.status === 'failed' ? (
          <XCircle size={12} color={colors.agentError} />
        ) : (
          <Loader2 size={12} color={colors.agentActive} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 18 }}>
          {step.message}
        </Text>
        {step.detail ? (
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }} numberOfLines={2}>
            {step.detail}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Tool call row
// ---------------------------------------------------------------------------

function ToolCallRow({ tool }: { tool: ToolCall }) {
  const statusColor =
    tool.status === 'completed'
      ? colors.agentSuccess
      : tool.status === 'failed'
        ? colors.agentError
        : colors.agentActive;

  return (
    <View
      style={{
        padding: 10,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        marginBottom: 6,
        gap: 4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>
          {tool.name}
        </Text>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: statusColor,
          }}
        />
      </View>
      {tool.command ? (
        <Text
          style={{
            fontSize: 11,
            fontFamily: 'Menlo',
            color: colors.textMuted,
            backgroundColor: 'rgba(0,0,0,0.3)',
            padding: 4,
            borderRadius: 4,
          }}
          numberOfLines={2}
        >
          {tool.command}
        </Text>
      ) : null}
      {tool.duration != null ? (
        <Text style={{ fontSize: 11, color: colors.textMuted }}>{tool.duration}ms</Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Approval request row
// ---------------------------------------------------------------------------

function ApprovalRow({
  request,
  onApprove,
  onReject,
}: {
  request: ApprovalRequest;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  if (request.status !== 'pending') return null;

  const isHigh = request.riskLevel === 'high';
  const borderColor = isHigh ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)';
  const bgColor = isHigh ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)';

  return (
    <View
      style={{
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor,
        backgroundColor: bgColor,
        gap: 8,
        marginBottom: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {isHigh ? (
          <ShieldAlert size={14} color={colors.agentError} />
        ) : (
          <ShieldCheck size={14} color={colors.agentWarning} />
        )}
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary, flex: 1 }}>
          {request.toolName}
        </Text>
        <Badge label={request.riskLevel} color={getRiskBadgeColor(request.riskLevel)} />
      </View>
      <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 17 }} numberOfLines={4}>
        {request.description}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          title="Approve"
          variant="primary"
          size="sm"
          onPress={() => onApprove(request.id)}
          className="flex-1"
        />
        <Button
          title="Reject"
          variant="destructive"
          size="sm"
          onPress={() => onReject(request.id)}
          className="flex-1"
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function AgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const agent = useAgentStore((s) => s.agents.find((a) => a.id === id));
  const pendingApprovals = useAgentStore((s) =>
    s.pendingApprovals.filter((r) => r.status === 'pending'),
  );
  const approveRequest = useAgentStore((s) => s.approveRequest);
  const rejectRequest = useAgentStore((s) => s.rejectRequest);

  const createConversation = useChatStore((s) => s.createConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const selectedModel = useModelStore((s) => s.selectedModel);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/agents');
  }, [router]);

  const handleCommand = useCallback(
    (command: 'pause' | 'resume' | 'cancel') => {
      if (!id) return;
      if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      sendAgentCommand(id, command);
    },
    [id, hapticsEnabled],
  );

  const handleApprove = useCallback(
    (approvalId: string) => {
      if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      approveRequest(approvalId);
      sendApprovalResponse(approvalId, true);
    },
    [approveRequest, hapticsEnabled],
  );

  const handleReject = useCallback(
    (approvalId: string) => {
      if (hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      rejectRequest(approvalId);
      sendApprovalResponse(approvalId, false);
    },
    [rejectRequest, hapticsEnabled],
  );

  const handleStartTask = useCallback(async () => {
    if (!agent) return;
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const title = `Task with ${agent.name}`;
      const conversationId = await createConversation(title);
      router.push(`/(app)/chat/${conversationId}`);
      sendMessage(
        conversationId,
        `I'd like to start a new task with the agent: ${agent.name}`,
        selectedModel,
      );
    } catch {
      Alert.alert('Error', 'Could not create a new conversation. Please try again.');
    }
  }, [agent, createConversation, sendMessage, selectedModel, router, hapticsEnabled]);

  if (!agent) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Bot size={40} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>Agent not found</Text>
        <Button title="Go back" variant="ghost" size="sm" onPress={handleBack} />
      </SafeAreaView>
    );
  }

  const STATUS_COLOR: Record<typeof agent.status, string> = {
    running: colors.agentActive,
    completed: colors.agentSuccess,
    failed: colors.agentError,
    waiting: colors.agentWarning,
  };

  const statusColor = STATUS_COLOR[agent.status];
  const isActive = agent.status === 'running' || agent.status === 'waiting';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          height: 52,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: 8,
        }}
      >
        <Pressable
          onPress={handleBack}
          style={{ padding: 8, borderRadius: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text
          style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.textPrimary }}
          numberOfLines={1}
        >
          {agent.name}
        </Text>
        <AgentStatusBadge status={agent.status} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Overview card */}
        <Animated.View entering={FadeIn.duration(250)}>
          <Card>
            {/* Icon + name row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: `${statusColor}18`,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Bot size={24} color={statusColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>
                  {agent.name}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                  {agent.model}
                </Text>
              </View>
            </View>

            <Separator />

            {/* Stats */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-around',
                marginTop: 12,
                marginBottom: 4,
              }}
            >
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: statusColor }}>
                  {agent.progress}%
                </Text>
                <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                  Progress
                </Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.textPrimary }}>
                  {agent.steps?.length ?? 0}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Steps</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: colors.textPrimary }}>
                  {agent.toolCalls?.length ?? 0}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                  Tool calls
                </Text>
              </View>
            </View>
          </Card>
        </Animated.View>

        {/* Progress bar section */}
        {agent.status === 'running' && (
          <Animated.View entering={FadeInDown.delay(60).duration(200)}>
            <Card>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: 'rgba(255,255,255,0.35)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  marginBottom: 10,
                }}
              >
                Progress
              </Text>
              <ProgressBar progress={agent.progress} color={statusColor} />
              {agent.currentStep ? (
                <Text
                  style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}
                  numberOfLines={2}
                >
                  {agent.currentStep}
                </Text>
              ) : null}
            </Card>
          </Animated.View>
        )}

        {/* Pending approvals */}
        {pendingApprovals.length > 0 && (
          <Animated.View entering={FadeInDown.delay(100).duration(200)}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: 'rgba(255,255,255,0.35)',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                marginBottom: 8,
              }}
            >
              Pending Approvals
            </Text>
            {pendingApprovals.map((req) => (
              <ApprovalRow
                key={req.id}
                request={req}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))}
          </Animated.View>
        )}

        {/* Controls for active agents */}
        {isActive && (
          <Animated.View entering={FadeInDown.delay(120).duration(200)}>
            <Card>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: 'rgba(255,255,255,0.35)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  marginBottom: 12,
                }}
              >
                Controls
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {agent.status === 'running' && (
                  <Pressable
                    onPress={() => handleCommand('pause')}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: 'rgba(245,158,11,0.12)',
                      borderWidth: 1,
                      borderColor: 'rgba(245,158,11,0.2)',
                    }}
                    accessibilityLabel="Pause agent"
                    accessibilityRole="button"
                  >
                    <Pause size={14} color={colors.agentWarning} />
                    <Text style={{ fontSize: 13, color: colors.agentWarning, fontWeight: '500' }}>
                      Pause
                    </Text>
                  </Pressable>
                )}
                {agent.status === 'waiting' && (
                  <Pressable
                    onPress={() => handleCommand('resume')}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: 'rgba(59,130,246,0.12)',
                      borderWidth: 1,
                      borderColor: 'rgba(59,130,246,0.2)',
                    }}
                    accessibilityLabel="Resume agent"
                    accessibilityRole="button"
                  >
                    <Play size={14} color={colors.agentActive} />
                    <Text style={{ fontSize: 13, color: colors.agentActive, fontWeight: '500' }}>
                      Resume
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => {
                    Alert.alert('Cancel Agent', `Stop "${agent.name}"? This cannot be undone.`, [
                      { text: 'Keep Running', style: 'cancel' },
                      {
                        text: 'Cancel Agent',
                        style: 'destructive',
                        onPress: () => handleCommand('cancel'),
                      },
                    ]);
                  }}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 10,
                    borderRadius: 8,
                    backgroundColor: 'rgba(239,68,68,0.12)',
                    borderWidth: 1,
                    borderColor: 'rgba(239,68,68,0.2)',
                  }}
                  accessibilityLabel="Cancel agent"
                  accessibilityRole="button"
                >
                  <Square size={14} color={colors.agentError} />
                  <Text style={{ fontSize: 13, color: colors.agentError, fontWeight: '500' }}>
                    Cancel
                  </Text>
                </Pressable>
              </View>
            </Card>
          </Animated.View>
        )}

        {/* Steps — rich ToolTimeline component */}
        {agent.steps && agent.steps.length > 0 && (
          <Animated.View entering={FadeInDown.delay(160).duration(200)}>
            <Card>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: 'rgba(255,255,255,0.35)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  marginBottom: 12,
                }}
              >
                Execution Timeline
              </Text>
              <ToolTimeline steps={agent.steps} />
            </Card>
          </Animated.View>
        )}

        {/* Tool calls */}
        {agent.toolCalls && agent.toolCalls.length > 0 && (
          <Animated.View entering={FadeInDown.delay(200).duration(200)}>
            <Card>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: 'rgba(255,255,255,0.35)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  marginBottom: 10,
                }}
              >
                Tool Calls
              </Text>
              {agent.toolCalls.map((tool) => (
                <ToolCallRow key={tool.id} tool={tool} />
              ))}
            </Card>
          </Animated.View>
        )}

        {/* Start new task CTA */}
        <Animated.View entering={FadeInDown.delay(240).duration(200)} style={{ marginBottom: 32 }}>
          <Button
            title={`Start New Task with ${agent.name}`}
            variant="primary"
            size="lg"
            onPress={handleStartTask}
            className="w-full"
          />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
