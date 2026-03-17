/**
 * AgentDashboard — Real-time view of desktop agents with live status updates.
 *
 * Features:
 * - Real-time agent list synced via WebSocket/WebRTC from desktop
 * - Per-agent: current task, tool being used, progress %, status badge
 * - Tap to expand: full tool execution log with timeline
 * - Status filter tabs (All / Running / Waiting / Completed / Failed)
 * - Pull-to-refresh for manual sync
 * - Agent commands (pause, resume, cancel) from mobile
 * - Inline approval cards for pending tool approvals
 * - Empty states for disconnected and no-agents scenarios
 * - Integrated approval queue badge in header
 */

import { useCallback, useMemo, useState } from 'react';
import { View, Pressable, RefreshControl, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeIn, FadeOut, SlideInDown, LinearTransition } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  Bot,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Square,
  Shield,
  Terminal,
  Eye,
  Wrench,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAgentStore, type Agent } from '@/stores/agentStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';
import { requestAgentRefresh, sendAgentCommand, getRiskBadgeColor } from '@/services/companion';
import { useAgentDashboardStore, type AgentFilterStatus, getFilteredAgents } from './agentStore';
import type { ApprovalRequest } from '@/types/chat';

// ---------------------------------------------------------------------------
// Filter Tabs
// ---------------------------------------------------------------------------

const FILTER_TABS: { key: AgentFilterStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'completed', label: 'Done' },
  { key: 'failed', label: 'Failed' },
];

function FilterTabs() {
  const filterStatus = useAgentDashboardStore((s) => s.filterStatus);
  const setFilterStatus = useAgentDashboardStore((s) => s.setFilterStatus);
  const agents = useAgentStore((s) => s.agents);

  function getCount(filter: AgentFilterStatus): number {
    if (filter === 'all') return agents.length;
    return agents.filter((a) => a.status === filter).length;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 8 }}
    >
      {FILTER_TABS.map((tab) => {
        const count = getCount(tab.key);
        const isActive = filterStatus === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => setFilterStatus(tab.key)}
            className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${
              isActive ? 'bg-teal-500/20' : 'bg-white/5'
            }`}
            accessibilityLabel={`Filter: ${tab.label} (${count})`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text className={`text-xs font-medium ${isActive ? 'text-teal-400' : 'text-white/50'}`}>
              {tab.label}
            </Text>
            {count > 0 && (
              <View
                className={`min-w-[18px] h-[18px] rounded-full items-center justify-center px-1 ${
                  isActive ? 'bg-teal-500/30' : 'bg-white/10'
                }`}
              >
                <Text
                  className={`text-[10px] font-bold ${isActive ? 'text-teal-300' : 'text-white/40'}`}
                >
                  {count}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

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

function ProgressBar({ progress, color }: { progress: number; color?: string }) {
  const clamped = Math.max(0, Math.min(100, progress));
  return (
    <View className="h-1.5 rounded-full bg-white/10 overflow-hidden">
      <Animated.View
        className="h-full rounded-full"
        style={{ width: `${clamped}%`, backgroundColor: color ?? colors.teal }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inline Approval Card
// ---------------------------------------------------------------------------

function InlineApproval({ request }: { request: ApprovalRequest }) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const approveRequest = useAgentStore((s) => s.approveRequest);
  const rejectRequest = useAgentStore((s) => s.rejectRequest);

  if (request.status !== 'pending') return null;

  return (
    <Animated.View entering={FadeIn.duration(200)} layout={LinearTransition.springify()}>
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
              ? 'rgba(239, 68, 68, 0.06)'
              : request.riskLevel === 'medium'
                ? 'rgba(245, 158, 11, 0.06)'
                : 'rgba(16, 185, 129, 0.06)',
        }}
      >
        <View className="flex-row items-center gap-2 mb-2">
          <Shield size={12} color={colors.agentWarning} />
          <Text className="text-xs font-medium text-white/80">{request.toolName}</Text>
          <Badge label={request.riskLevel} color={getRiskBadgeColor(request.riskLevel)} />
        </View>
        <Text className="text-[11px] text-white/60 mb-3" numberOfLines={2}>
          {request.description}
        </Text>
        <View className="flex-row gap-2">
          <Button
            title="Approve"
            variant="primary"
            size="sm"
            onPress={() => {
              if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              approveRequest(request.id);
            }}
            className="flex-1"
          />
          <Button
            title="Deny"
            variant="destructive"
            size="sm"
            onPress={() => {
              if (hapticsEnabled)
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              rejectRequest(request.id);
            }}
            className="flex-1"
          />
        </View>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Tool Log Item
// ---------------------------------------------------------------------------

function ToolLogItem({ tool }: { tool: Agent['toolCalls'][number] }) {
  const iconMap: Record<string, typeof Terminal> = {
    bash: Terminal,
    read: Eye,
    write: Wrench,
  };
  const Icon = iconMap[tool.name.toLowerCase()] ?? Wrench;

  return (
    <View className="flex-row items-start gap-2.5 py-1.5">
      <View
        className="w-5 h-5 rounded items-center justify-center mt-0.5"
        style={{
          backgroundColor:
            tool.status === 'completed'
              ? 'rgba(16, 185, 129, 0.15)'
              : tool.status === 'failed'
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(59, 130, 246, 0.15)',
        }}
      >
        <Icon
          size={10}
          color={
            tool.status === 'completed'
              ? colors.agentSuccess
              : tool.status === 'failed'
                ? colors.agentError
                : colors.agentActive
          }
        />
      </View>
      <View className="flex-1">
        <Text className="text-[11px] text-white/70" numberOfLines={1}>
          {tool.name}
          {tool.filePath ? ` (${tool.filePath})` : ''}
        </Text>
        {tool.output ? (
          <Text className="text-[10px] text-white/40 mt-0.5" numberOfLines={2}>
            {tool.output}
          </Text>
        ) : null}
      </View>
      {tool.duration != null && (
        <Text className="text-[10px] text-white/30">{tool.duration}ms</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Agent Card (expanded with tool log)
// ---------------------------------------------------------------------------

interface AgentCardProps {
  agent: Agent;
}

function DashboardAgentCard({ agent }: AgentCardProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const expandedAgentId = useAgentDashboardStore((s) => s.expandedAgentId);
  const setExpandedAgent = useAgentDashboardStore((s) => s.setExpandedAgent);

  const isExpanded = expandedAgentId === agent.id;
  const pendingApprovals = useAgentStore((s) =>
    s.pendingApprovals.filter((r) => r.status === 'pending'),
  );

  const timeElapsed = getTimeElapsed(agent.startedAt);

  const toggleExpand = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpandedAgent(isExpanded ? null : agent.id);
  }, [isExpanded, agent.id, setExpandedAgent, hapticsEnabled]);

  const handleCommand = useCallback(
    (command: 'pause' | 'resume' | 'cancel') => {
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      sendAgentCommand(agent.id, command);
    },
    [agent.id, hapticsEnabled],
  );

  return (
    <Animated.View entering={FadeIn.duration(200)} layout={LinearTransition.springify()}>
      <Pressable
        onPress={toggleExpand}
        accessibilityLabel={`Agent: ${agent.name}, status: ${agent.status}, ${agent.progress}% complete`}
        accessibilityRole="button"
        accessibilityHint={isExpanded ? 'Tap to collapse' : 'Tap to expand tool log'}
      >
        <Card variant={isExpanded ? 'elevated' : 'default'}>
          {/* Header row */}
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2.5 flex-1">
              <AgentStatusIcon status={agent.status} />
              <View className="flex-1">
                <Text className="text-sm font-medium text-white" numberOfLines={1}>
                  {agent.name}
                </Text>
                <View className="flex-row items-center gap-2 mt-0.5">
                  <Text className="text-[10px] text-white/40">{agent.model}</Text>
                  <Text className="text-[10px] text-white/30">{timeElapsed}</Text>
                </View>
              </View>
            </View>
            <View className="flex-row items-center gap-2">
              <Badge label={agent.status} color={getStatusBadgeColor(agent.status)} />
              {isExpanded ? (
                <ChevronUp size={14} color={colors.textMuted} />
              ) : (
                <ChevronDown size={14} color={colors.textMuted} />
              )}
            </View>
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

          {/* Expanded section: controls + tool log */}
          {isExpanded && (
            <Animated.View entering={SlideInDown.duration(200).springify()}>
              {/* Agent commands */}
              {(agent.status === 'running' || agent.status === 'waiting') && (
                <View className="flex-row gap-2 mt-2 mb-3">
                  {agent.status === 'running' && (
                    <Pressable
                      onPress={() => handleCommand('pause')}
                      className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 active:bg-white/10"
                      accessibilityLabel="Pause agent"
                    >
                      <Pause size={12} color={colors.agentWarning} />
                      <Text className="text-xs text-amber-400">Pause</Text>
                    </Pressable>
                  )}
                  {agent.status === 'waiting' && (
                    <Pressable
                      onPress={() => handleCommand('resume')}
                      className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 active:bg-white/10"
                      accessibilityLabel="Resume agent"
                    >
                      <Play size={12} color={colors.agentSuccess} />
                      <Text className="text-xs text-emerald-400">Resume</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => handleCommand('cancel')}
                    className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 active:bg-white/10"
                    accessibilityLabel="Cancel agent"
                  >
                    <Square size={12} color={colors.agentError} />
                    <Text className="text-xs text-red-400">Cancel</Text>
                  </Pressable>
                </View>
              )}

              {/* Inline approvals */}
              {pendingApprovals.map((req) => (
                <InlineApproval key={req.id} request={req} />
              ))}

              {/* Tool execution log */}
              {agent.toolCalls && agent.toolCalls.length > 0 && (
                <View className="mt-3">
                  <Separator className="mb-3" />
                  <Text className="text-[10px] text-white/50 mb-2 uppercase tracking-wider">
                    Tool Execution Log ({agent.toolCalls.length})
                  </Text>
                  {agent.toolCalls.map((tool) => (
                    <ToolLogItem key={tool.id} tool={tool} />
                  ))}
                </View>
              )}

              {/* Steps timeline */}
              {agent.steps && agent.steps.length > 0 && (
                <View className="mt-3">
                  <Separator className="mb-3" />
                  <Text className="text-[10px] text-white/50 mb-2 uppercase tracking-wider">
                    Steps
                  </Text>
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
            </Animated.View>
          )}
        </Card>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

interface AgentDashboardProps {
  /** Whether to show the filter tabs */
  showFilters?: boolean;
  /** Optional header component */
  header?: React.ReactElement;
}

export function AgentDashboard({ showFilters = true, header }: AgentDashboardProps) {
  const agents = useAgentStore((s) => s.agents);
  const connectionStatus = useConnectionStore((s) => s.status);
  const pendingApprovals = useAgentStore((s) =>
    s.pendingApprovals.filter((r) => r.status === 'pending'),
  );

  const filteredAgents = useMemo(() => getFilteredAgents(agents), [agents]);

  const handleRefresh = useCallback(() => {
    requestAgentRefresh();
  }, []);

  // Disconnected state
  if (connectionStatus !== 'connected') {
    return (
      <View className="flex-1 items-center justify-center px-8 py-12">
        <View className="w-16 h-16 rounded-2xl bg-white/5 items-center justify-center mb-4">
          <Bot size={28} color={colors.textMuted} />
        </View>
        <Text className="text-white/60 text-center text-sm">Not connected to desktop</Text>
        <Text className="text-white/40 text-center text-xs mt-1">
          Pair with your desktop to see live agent status.
        </Text>
      </View>
    );
  }

  // No agents state
  if (agents.length === 0) {
    return (
      <View className="flex-1">
        {showFilters && <FilterTabs />}
        <View className="flex-1 items-center justify-center px-8 py-12">
          <View className="w-16 h-16 rounded-2xl bg-white/5 items-center justify-center mb-4">
            <Bot size={28} color={colors.textMuted} />
          </View>
          <Text className="text-white/60 text-center text-sm">
            No agents running on the desktop.
          </Text>
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
      </View>
    );
  }

  return (
    <View className="flex-1">
      {showFilters && <FilterTabs />}

      <FlashList
        data={filteredAgents}
        keyExtractor={(item) => item.id}
        estimatedItemSize={160}
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
        ListHeaderComponent={
          header ?? (
            <View className="flex-row items-center justify-between py-3">
              <Text className="text-xs text-white/50 uppercase tracking-wider">Active Agents</Text>
              <View className="flex-row items-center gap-2">
                {pendingApprovals.length > 0 && (
                  <Badge label={`${pendingApprovals.length} approvals`} color="red" />
                )}
                <Badge
                  label={`${filteredAgents.length} agents`}
                  color={filteredAgents.some((a) => a.status === 'running') ? 'blue' : 'gray'}
                />
              </View>
            </View>
          )
        }
        renderItem={({ item }) => <DashboardAgentCard agent={item} />}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
