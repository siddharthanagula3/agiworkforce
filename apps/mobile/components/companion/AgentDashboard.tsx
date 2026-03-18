import { useCallback } from 'react';
import { View, Pressable, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  Bot,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Pause,
  Square,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAgentStore, type Agent } from '@/stores/agentStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';
import {
  sendApprovalResponse,
  requestAgentRefresh,
  sendAgentCommand,
  getRiskBadgeColor,
} from '@/services/companion';
import type { ApprovalRequest } from '@/types/chat';

// ---------------------------------------------------------------------------
// Agent Status Icon
// ---------------------------------------------------------------------------

function AgentStatusIcon({ status }: { status: Agent['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 size={16} color={colors.agentActive} />;
    case 'completed':
      return <CheckCircle2 size={16} color={colors.agentSuccess} />;
    case 'failed':
      return <XCircle size={16} color={colors.agentError} />;
    case 'waiting':
      return <Clock size={16} color={colors.agentWarning} />;
    default:
      return <Bot size={16} color={colors.textMuted} />;
  }
}

function getStatusBadgeColor(status: Agent['status']): 'blue' | 'green' | 'red' | 'yellow' {
  switch (status) {
    case 'running':
      return 'blue';
    case 'completed':
      return 'green';
    case 'failed':
      return 'red';
    case 'waiting':
      return 'yellow';
    default:
      return 'blue';
  }
}

// ---------------------------------------------------------------------------
// Progress Bar
// ---------------------------------------------------------------------------

function ProgressBar({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(100, progress));
  return (
    <View className="h-1.5 rounded-full bg-white/10 overflow-hidden">
      <View className="h-full rounded-full bg-teal-500" style={{ width: `${clamped}%` }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Approval Card (inline in agent card)
// ---------------------------------------------------------------------------

interface ApprovalCardProps {
  request: ApprovalRequest;
  agentId: string;
}

function ApprovalCard({ request, agentId: _agentId }: ApprovalCardProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const handleApprove = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    sendApprovalResponse(request.id, true);
  }, [request.id, hapticsEnabled]);

  const handleReject = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    sendApprovalResponse(request.id, false);
  }, [request.id, hapticsEnabled]);

  if (request.status !== 'pending') return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      layout={LinearTransition.springify()}
    >
      <View
        className="mt-3 p-3 rounded-lg border"
        style={{
          borderColor:
            request.riskLevel === 'high'
              ? 'rgba(239, 68, 68, 0.3)'
              : request.riskLevel === 'medium'
                ? 'rgba(245, 158, 11, 0.3)'
                : 'rgba(16, 185, 129, 0.3)',
          backgroundColor:
            request.riskLevel === 'high'
              ? 'rgba(239, 68, 68, 0.08)'
              : request.riskLevel === 'medium'
                ? 'rgba(245, 158, 11, 0.08)'
                : 'rgba(16, 185, 129, 0.08)',
        }}
      >
        {/* Approval header */}
        <View className="flex-row items-center gap-2 mb-2">
          {request.riskLevel === 'high' ? (
            <ShieldAlert size={14} color={colors.agentError} />
          ) : (
            <ShieldCheck size={14} color={colors.agentSuccess} />
          )}
          <Text className="text-xs font-medium text-white/80">{request.toolName}</Text>
          <Badge label={request.riskLevel} color={getRiskBadgeColor(request.riskLevel)} />
        </View>

        {/* Description */}
        <Text className="text-xs text-white/60 mb-3" numberOfLines={3}>
          {request.description}
        </Text>

        {/* Approve / Reject buttons */}
        <View className="flex-row gap-2">
          <Button
            title="Approve"
            variant="primary"
            size="sm"
            onPress={handleApprove}
            className="flex-1"
          />
          <Button
            title="Reject"
            variant="destructive"
            size="sm"
            onPress={handleReject}
            className="flex-1"
          />
        </View>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Agent Card
// ---------------------------------------------------------------------------

interface AgentCardProps {
  agent: Agent;
  isSelected: boolean;
  onPress: () => void;
}

function AgentCard({ agent, isSelected, onPress }: AgentCardProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  // Approval requests from the agent store, filtered to pending ones for this context
  const pendingApprovals = useAgentStore((state) =>
    state.pendingApprovals.filter((r) => r.status === 'pending'),
  );

  const handleCommand = useCallback(
    (command: 'pause' | 'resume' | 'cancel') => {
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      sendAgentCommand(agent.id, command);
    },
    [agent.id, hapticsEnabled],
  );

  const timeElapsed = getTimeElapsed(agent.startedAt);

  return (
    <Animated.View entering={FadeIn.duration(200)} layout={LinearTransition.springify()}>
      <Pressable
        onPress={onPress}
        accessibilityLabel={`Agent: ${agent.name}, status: ${agent.status}`}
        accessibilityRole="button"
        accessibilityHint="Tap to select agent"
      >
        <Card
          variant={isSelected ? 'elevated' : 'default'}
          className={isSelected ? 'border border-teal-500/30' : ''}
        >
          {/* Header row */}
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2.5 flex-1">
              <AgentStatusIcon status={agent.status} />
              <Text className="text-sm font-medium text-white flex-shrink" numberOfLines={1}>
                {agent.name}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Badge label={agent.status} color={getStatusBadgeColor(agent.status)} />
              <ChevronRight size={14} color={colors.textMuted} />
            </View>
          </View>

          {/* Model + Time */}
          <View className="flex-row items-center gap-3 mb-2">
            <Text className="text-xs text-white/40">{agent.model}</Text>
            <Text className="text-xs text-white/40">{timeElapsed}</Text>
          </View>

          {/* Current step */}
          {agent.currentStep ? (
            <Text className="text-xs text-white/60 mb-2" numberOfLines={2}>
              {agent.currentStep}
            </Text>
          ) : null}

          {/* Progress bar */}
          {agent.status === 'running' && (
            <View className="mb-2">
              <ProgressBar progress={agent.progress} />
              <Text className="text-[10px] text-white/40 mt-1 text-right">{agent.progress}%</Text>
            </View>
          )}

          {/* Agent control buttons (only for running/waiting agents) */}
          {(agent.status === 'running' || agent.status === 'waiting') && isSelected && (
            <View className="flex-row gap-2 mt-1">
              {agent.status === 'running' && (
                <Pressable
                  onPress={() => handleCommand('pause')}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 active:bg-white/10"
                  accessibilityLabel="Pause agent"
                  accessibilityRole="button"
                >
                  <Pause size={12} color={colors.agentWarning} />
                  <Text className="text-xs text-amber-400">Pause</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => handleCommand('cancel')}
                className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 active:bg-white/10"
                accessibilityLabel="Cancel agent"
                accessibilityRole="button"
              >
                <Square size={12} color={colors.agentError} />
                <Text className="text-xs text-red-400">Cancel</Text>
              </Pressable>
            </View>
          )}

          {/* Inline approval requests */}
          {pendingApprovals.map((req) => (
            <ApprovalCard key={req.id} request={req} agentId={agent.id} />
          ))}

          {/* Steps accordion (shown when selected) */}
          {isSelected && agent.steps && agent.steps.length > 0 && (
            <View className="mt-3">
              <Separator className="mb-3" />
              <Text className="text-xs text-white/50 mb-2 uppercase tracking-wider">Steps</Text>
              {agent.steps.map((step) => (
                <View key={step.id} className="flex-row items-start gap-2 mb-1.5">
                  <View
                    className="w-1.5 h-1.5 rounded-full mt-1.5"
                    style={{
                      backgroundColor:
                        step.status === 'completed'
                          ? colors.agentSuccess
                          : step.status === 'failed'
                            ? colors.agentError
                            : colors.agentActive,
                    }}
                  />
                  <View className="flex-1">
                    <Text className="text-xs text-white/70" numberOfLines={1}>
                      {step.message}
                    </Text>
                    {step.detail && (
                      <Text className="text-[10px] text-white/40" numberOfLines={1}>
                        {step.detail}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Agent Dashboard (main export)
// ---------------------------------------------------------------------------

export function AgentDashboard() {
  const agents = useAgentStore((s) => s.agents);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const selectAgent = useAgentStore((s) => s.selectAgent);

  const handleRefresh = useCallback(() => {
    requestAgentRefresh();
  }, []);

  const handleAgentPress = useCallback(
    (agentId: string) => {
      // Toggle selection
      selectAgent(selectedAgentId === agentId ? null : agentId);
    },
    [selectedAgentId, selectAgent],
  );

  if (agents.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-8 py-12">
        <View className="w-16 h-16 rounded-2xl bg-white/5 items-center justify-center mb-4">
          <Bot size={28} color={colors.textMuted} />
        </View>
        <Text className="text-white/60 text-center text-sm">No agents running on the desktop.</Text>
        <Text className="text-white/40 text-center text-xs mt-1">
          Start an agent on your desktop to see it here.
        </Text>
        <Button
          title="Refresh"
          variant="ghost"
          size="sm"
          onPress={handleRefresh}
          className="mt-4"
        />
      </View>
    );
  }

  return (
    <FlashList
      data={agents}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={handleRefresh}
          tintColor={colors.teal}
          colors={[colors.teal]}
        />
      }
      renderItem={({ item }) => (
        <AgentCard
          agent={item}
          isSelected={selectedAgentId === item.id}
          onPress={() => handleAgentPress(item.id)}
        />
      )}
      ListHeaderComponent={
        <View className="flex-row items-center justify-between py-3">
          <Text className="text-xs text-white/50 uppercase tracking-wider">Active Agents</Text>
          <Badge
            label={`${agents.length} running`}
            color={agents.some((a) => a.status === 'running') ? 'blue' : 'gray'}
          />
        </View>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate a human-readable time elapsed string from a start ISO date.
 */
function getTimeElapsed(startedAt: string): string {
  try {
    const start = new Date(startedAt).getTime();
    const now = Date.now();
    const diffMs = now - start;

    if (diffMs < 0) return 'just now';

    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours < 24) {
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }

    const days = Math.floor(hours / 24);
    return `${days}d`;
  } catch {
    return '';
  }
}
