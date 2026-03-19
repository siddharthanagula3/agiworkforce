import { useCallback, useState } from 'react';
import { View, Pressable, RefreshControl, Alert, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
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
  Play,
  AlertOctagon,
  Terminal,
  FileX,
  Globe,
  Database,
  HelpCircle,
  FilePlus,
  FileEdit,
  AlertCircle,
  Zap,
  Timer,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAgentStore, type Agent, type RunArtifact } from '@/stores/agentStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';
import {
  sendApprovalResponse,
  requestAgentRefresh,
  sendAgentCommand,
  sendEmergencyStop,
  getRiskBadgeColor,
} from '@/services/companion';
import { ExecutionStream } from '@/components/companion/ExecutionStream';
import type { ApprovalRequest, RiskLevel } from '@/types/chat';

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
// ETA Calculator
// ---------------------------------------------------------------------------

/**
 * Estimate remaining time based on elapsed time and progress.
 * Returns a human-readable string or null if not calculable.
 */
function estimateTimeRemaining(
  startedAt: string,
  progress: number,
  stepsCompleted?: number,
  totalSteps?: number,
): string | null {
  if (progress <= 0 || progress >= 100) return null;

  try {
    const elapsed = Date.now() - new Date(startedAt).getTime();
    if (elapsed <= 0) return null;

    let fraction = progress / 100;

    // Use step-based rate if available (more accurate)
    if (stepsCompleted != null && totalSteps != null && stepsCompleted > 0 && totalSteps > 0) {
      fraction = stepsCompleted / totalSteps;
    }

    if (fraction <= 0) return null;

    const totalEstimated = elapsed / fraction;
    const remaining = totalEstimated - elapsed;

    if (remaining <= 0) return 'almost done';

    const seconds = Math.ceil(remaining / 1000);
    if (seconds < 60) return `~${seconds}s left`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `~${minutes}m left`;
    return `~${Math.ceil(minutes / 60)}h left`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Artifact Icon map
// ---------------------------------------------------------------------------

function ArtifactIcon({ type }: { type: RunArtifact['type'] }) {
  switch (type) {
    case 'file_created':
      return <FilePlus size={11} color={colors.agentSuccess} />;
    case 'file_modified':
      return <FileEdit size={11} color={colors.agentActive} />;
    case 'command_run':
      return <Terminal size={11} color={colors.textMuted} />;
    case 'error':
      return <AlertCircle size={11} color={colors.agentError} />;
    default:
      return <Zap size={11} color={colors.textMuted} />;
  }
}

function getArtifactTextColor(type: RunArtifact['type']): string {
  switch (type) {
    case 'file_created':
      return colors.agentSuccess;
    case 'file_modified':
      return colors.agentActive;
    case 'error':
      return colors.agentError;
    default:
      return colors.textMuted;
  }
}

// ---------------------------------------------------------------------------
// Run Artifacts List (compact)
// ---------------------------------------------------------------------------

interface RunArtifactsProps {
  artifacts: RunArtifact[];
  /** Max items to show before collapsing */
  maxVisible?: number;
}

function RunArtifactsList({ artifacts, maxVisible = 3 }: RunArtifactsProps) {
  const [expanded, setExpanded] = useState(false);

  if (artifacts.length === 0) return null;

  const visible = expanded ? artifacts : artifacts.slice(0, maxVisible);
  const hasMore = artifacts.length > maxVisible;

  return (
    <View className="mt-2.5">
      <Text className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">Artifacts</Text>
      {visible.map((artifact) => (
        <View key={artifact.id} className="flex-row items-start gap-1.5 mb-1">
          <View style={{ marginTop: 1 }}>
            <ArtifactIcon type={artifact.type} />
          </View>
          <Text
            className="text-[11px] flex-1"
            style={{ color: getArtifactTextColor(artifact.type) }}
            numberOfLines={1}
          >
            {artifact.label}
          </Text>
        </View>
      ))}
      {hasMore && (
        <Pressable
          onPress={() => setExpanded(!expanded)}
          className="flex-row items-center gap-1 mt-0.5"
          accessibilityLabel={expanded ? 'Show fewer artifacts' : 'Show more artifacts'}
          accessibilityRole="button"
        >
          <Text className="text-[10px] text-teal-400">
            {expanded ? 'Show less' : `+${artifacts.length - maxVisible} more`}
          </Text>
          {expanded ? (
            <ChevronUp size={10} color={colors.teal} />
          ) : (
            <ChevronDown size={10} color={colors.teal} />
          )}
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Expandable Log View — last N tool calls
// ---------------------------------------------------------------------------

interface ToolCallLogProps {
  toolCalls: Agent['toolCalls'];
  maxVisible?: number;
}

function ToolCallLog({ toolCalls, maxVisible = 10 }: ToolCallLogProps) {
  const [expanded, setExpanded] = useState(false);

  if (toolCalls.length === 0) return null;

  // Show most recent first
  const recent = [...toolCalls].reverse().slice(0, maxVisible);
  const visible = expanded ? recent : recent.slice(0, 3);

  return (
    <View className="mt-2.5">
      <Pressable
        onPress={() => setExpanded(!expanded)}
        className="flex-row items-center gap-1 mb-1.5"
        accessibilityLabel={expanded ? 'Collapse tool call log' : 'Expand tool call log'}
        accessibilityRole="button"
      >
        <Text className="text-[10px] text-white/40 uppercase tracking-wider flex-1">
          Tool Calls ({toolCalls.length})
        </Text>
        {expanded ? (
          <ChevronUp size={10} color={colors.textMuted} />
        ) : (
          <ChevronDown size={10} color={colors.textMuted} />
        )}
      </Pressable>

      {visible.map((call) => (
        <View key={call.id} className="flex-row items-start gap-1.5 mb-1.5">
          <View
            className="w-1.5 h-1.5 rounded-full mt-1.5"
            style={{
              backgroundColor:
                call.status === 'completed'
                  ? colors.agentSuccess
                  : call.status === 'failed'
                    ? colors.agentError
                    : colors.agentActive,
            }}
          />
          <View className="flex-1">
            <Text className="text-[11px] text-white/70" numberOfLines={1}>
              {call.name}
              {call.command ? `: ${call.command}` : ''}
            </Text>
            {call.duration != null && (
              <Text className="text-[10px] text-white/30">{call.duration}ms</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Risk level config + type icon map
// ---------------------------------------------------------------------------

const RISK_BORDER_COLORS: Record<RiskLevel, string> = {
  low: 'rgba(16, 185, 129, 0.3)',
  medium: 'rgba(245, 158, 11, 0.3)',
  high: 'rgba(239, 68, 68, 0.3)',
};

const RISK_BG_COLORS: Record<RiskLevel, string> = {
  low: 'rgba(16, 185, 129, 0.08)',
  medium: 'rgba(245, 158, 11, 0.08)',
  high: 'rgba(239, 68, 68, 0.08)',
};

const RISK_TEXT_COLORS: Record<RiskLevel, string> = {
  low: colors.agentSuccess,
  medium: colors.agentWarning,
  high: colors.agentError,
};

const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'Safe',
  medium: 'Moderate risk',
  high: 'Dangerous',
};

const TYPE_ICONS: Record<ApprovalRequest['type'], typeof Terminal> = {
  file_delete: FileX,
  command: Terminal,
  api_call: Globe,
  data_modification: Database,
  other: HelpCircle,
};

// ---------------------------------------------------------------------------
// Approval Card (inline in agent card) — Task 3: richer preview
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

  const TypeIcon = TYPE_ICONS[request.type];
  const riskColor = RISK_TEXT_COLORS[request.riskLevel];
  const RiskShieldIcon = request.riskLevel === 'high' ? ShieldAlert : ShieldCheck;
  const hasCountdown = typeof request.countdown === 'number' && request.countdown > 0;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      layout={LinearTransition.springify()}
    >
      <View
        className="mt-3 rounded-xl border overflow-hidden"
        style={{
          borderColor: RISK_BORDER_COLORS[request.riskLevel],
          backgroundColor: RISK_BG_COLORS[request.riskLevel],
        }}
      >
        {/* Header row: type icon + tool name + risk badge */}
        <View className="flex-row items-center gap-2 px-3 pt-3 pb-2">
          <View
            className="w-7 h-7 rounded-lg items-center justify-center"
            style={{ backgroundColor: `${riskColor}20` }}
          >
            <TypeIcon size={14} color={riskColor} />
          </View>
          <Text className="text-xs font-semibold text-white flex-1" numberOfLines={1}>
            {request.toolName}
          </Text>
          <View className="flex-row items-center gap-1">
            <RiskShieldIcon size={11} color={riskColor} />
            <Text className="text-[10px] font-medium" style={{ color: riskColor }}>
              {RISK_LABELS[request.riskLevel]}
            </Text>
          </View>
        </View>

        <View style={{ height: 1, backgroundColor: RISK_BORDER_COLORS[request.riskLevel] }} />

        {/* Description — what the tool will do */}
        <View className="px-3 py-2.5">
          <Text className="text-[11px] text-white/70 leading-[16px]" numberOfLines={4}>
            {request.description}
          </Text>
        </View>

        {/* Countdown badge (time until auto-timeout) */}
        {hasCountdown && (
          <View className="px-3 pb-2 flex-row items-center gap-1.5">
            <Clock size={10} color={colors.textMuted} />
            <Text className="text-[10px] text-white/40">Auto-reject in {request.countdown}s</Text>
          </View>
        )}

        {/* Approve / Reject buttons — prominently color coded */}
        <View className="flex-row gap-2 px-3 pb-3">
          <Pressable
            onPress={handleApprove}
            className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl active:opacity-80"
            style={{ backgroundColor: colors.agentSuccess }}
            accessibilityLabel={`Approve ${request.toolName}`}
            accessibilityRole="button"
          >
            <ShieldCheck size={13} color="#fff" />
            <Text className="text-xs font-semibold text-white">Approve</Text>
          </Pressable>
          <Pressable
            onPress={handleReject}
            className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl active:opacity-80"
            style={{ backgroundColor: colors.agentError }}
            accessibilityLabel={`Reject ${request.toolName}`}
            accessibilityRole="button"
          >
            <ShieldAlert size={13} color="#fff" />
            <Text className="text-xs font-semibold text-white">Deny</Text>
          </Pressable>
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
  onViewDetail: () => void;
}

function AgentCard({ agent, isSelected, onPress, onViewDetail }: AgentCardProps) {
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

  const handleCancelWithConfirm = useCallback(() => {
    Alert.alert('Cancel Task', `Are you sure you want to cancel "${agent.name}"?`, [
      { text: 'Keep Running', style: 'cancel' },
      {
        text: 'Cancel Task',
        style: 'destructive',
        onPress: () => handleCommand('cancel'),
      },
    ]);
  }, [agent.name, handleCommand]);

  const timeElapsed = getTimeElapsed(agent.startedAt);
  const eta =
    agent.status === 'running'
      ? estimateTimeRemaining(
          agent.startedAt,
          agent.progress,
          agent.stepsCompleted,
          agent.totalSteps,
        )
      : null;

  return (
    <Animated.View entering={FadeIn.duration(200)} layout={LinearTransition.springify()}>
      <Pressable
        onPress={onPress}
        accessibilityLabel={`Agent: ${agent.name}, status: ${agent.status}`}
        accessibilityRole="button"
        accessibilityHint="Tap to expand agent details"
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
              <Pressable
                onPress={onViewDetail}
                className="p-1 rounded-md active:bg-white/5"
                accessibilityLabel={`View details for ${agent.name}`}
                accessibilityRole="button"
              >
                <ChevronRight size={14} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>

          {/* Model + Time */}
          <View className="flex-row items-center gap-3 mb-2">
            <Text className="text-xs text-white/40">{agent.model}</Text>
            <Text className="text-xs text-white/40">{timeElapsed}</Text>
            {eta && (
              <View className="flex-row items-center gap-1">
                <Timer size={10} color={colors.textMuted} />
                <Text className="text-xs text-white/40">{eta}</Text>
              </View>
            )}
          </View>

          {/* Current action indicator */}
          {agent.currentAction ? (
            <View className="flex-row items-center gap-1.5 mb-2 px-2 py-1.5 rounded-lg bg-blue-500/8">
              <Zap size={10} color={colors.agentActive} />
              <Text className="text-[11px] text-blue-400 flex-1" numberOfLines={1}>
                {agent.currentAction}
              </Text>
            </View>
          ) : agent.currentStep ? (
            <Text className="text-xs text-white/60 mb-2" numberOfLines={2}>
              {agent.currentStep}
            </Text>
          ) : null}

          {/* Progress bar with step count */}
          {agent.status === 'running' && (
            <View className="mb-2">
              <ProgressBar progress={agent.progress} />
              <View className="flex-row items-center justify-between mt-1">
                {agent.totalSteps != null && agent.stepsCompleted != null ? (
                  <Text className="text-[10px] text-white/40">
                    {agent.stepsCompleted}/{agent.totalSteps} steps
                  </Text>
                ) : (
                  <View />
                )}
                <Text className="text-[10px] text-white/40">{agent.progress}%</Text>
              </View>
            </View>
          )}

          {/* Agent control buttons (only for running/waiting/paused agents when selected) */}
          {(agent.status === 'running' || agent.status === 'waiting') && isSelected && (
            <View className="flex-row gap-2 mt-1 flex-wrap">
              {agent.status === 'running' ? (
                <Pressable
                  onPress={() => handleCommand('pause')}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/10 active:bg-amber-500/20"
                  accessibilityLabel="Pause agent"
                  accessibilityRole="button"
                >
                  <Pause size={12} color={colors.agentWarning} />
                  <Text className="text-xs text-amber-400 font-medium">Pause</Text>
                </Pressable>
              ) : (
                /* waiting status — show resume */
                <Pressable
                  onPress={() => handleCommand('resume')}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-md bg-teal-500/10 active:bg-teal-500/20"
                  accessibilityLabel="Resume agent"
                  accessibilityRole="button"
                >
                  <Play size={12} color={colors.teal} />
                  <Text className="text-xs text-teal-400 font-medium">Resume</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => handleCancelWithConfirm()}
                className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 active:bg-red-500/20"
                accessibilityLabel="Cancel agent"
                accessibilityRole="button"
              >
                <Square size={12} color={colors.agentError} />
                <Text className="text-xs text-red-400 font-medium">Cancel</Text>
              </Pressable>
            </View>
          )}

          {/* Run artifacts (compact, shown when selected) */}
          {isSelected && agent.artifacts && agent.artifacts.length > 0 && (
            <>
              <Separator className="mt-3 mb-0" />
              <RunArtifactsList artifacts={agent.artifacts} maxVisible={3} />
            </>
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

          {/* Tool call log (shown when selected and expanded) */}
          {isSelected && agent.toolCalls && agent.toolCalls.length > 0 && (
            <View className="mt-2">
              <Separator className="mb-3" />
              <ToolCallLog toolCalls={agent.toolCalls} maxVisible={10} />
            </View>
          )}

          {/* Live execution stream — shown inline when agent is running and selected */}
          {isSelected && agent.status === 'running' && agent.toolCalls.length > 0 && (
            <View className="mt-3">
              <Separator className="mb-3" />
              <Text className="text-[10px] text-white/40 uppercase tracking-wider mb-2">
                Live Execution
              </Text>
              <ExecutionStream taskId={agent.id} />
            </View>
          )}

          {/* Quick actions — shown when selected */}
          {isSelected && (
            <View className="mt-3">
              <Separator className="mb-3" />
              <Text className="text-[10px] text-white/40 uppercase tracking-wider mb-2">
                Quick Actions
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {/* View Thread */}
                <Pressable
                  onPress={onViewDetail}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 active:bg-white/10"
                  accessibilityLabel={`View thread for ${agent.name}`}
                  accessibilityRole="button"
                >
                  <ExternalLink size={12} color={colors.textMuted} />
                  <Text className="text-xs text-white/60 font-medium">View Thread</Text>
                </Pressable>

                {/* Stop Agent — shown for running agents */}
                {agent.status === 'running' && (
                  <Pressable
                    onPress={() => {
                      Alert.alert('Stop Agent', `Stop "${agent.name}" immediately?`, [
                        { text: 'Keep Running', style: 'cancel' },
                        {
                          text: 'Stop Agent',
                          style: 'destructive',
                          onPress: () => sendAgentCommand(agent.id, 'cancel'),
                        },
                      ]);
                    }}
                    className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 active:bg-red-500/20"
                    accessibilityLabel={`Stop agent ${agent.name}`}
                    accessibilityRole="button"
                  >
                    <Square size={12} color={colors.agentError} />
                    <Text className="text-xs text-red-400 font-medium">Stop Agent</Text>
                  </Pressable>
                )}

                {/* Approve / Deny — shortcut when there are pending approvals */}
                {pendingApprovals.length > 0 && (
                  <Pressable
                    onPress={() => {
                      // Scroll user to the approval card by toggling selection
                    }}
                    className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/10 active:bg-amber-500/20"
                    accessibilityLabel="Review pending approvals"
                    accessibilityRole="button"
                  >
                    <ShieldAlert size={12} color={colors.agentWarning} />
                    <Text className="text-xs text-amber-400 font-medium">
                      {pendingApprovals.length} Pending
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        </Card>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// File Results Section — aggregates all file artifacts across agents
// ---------------------------------------------------------------------------

interface FileResultsSectionProps {
  agents: Agent[];
}

function FileResultsSection({ agents }: FileResultsSectionProps) {
  const [expanded, setExpanded] = useState(true);

  // Collect all file artifacts from all agents
  const fileArtifacts = agents.flatMap((a) =>
    (a.artifacts ?? [])
      .filter((art) => art.type === 'file_created' || art.type === 'file_modified')
      .map((art) => ({ ...art, agentName: a.name })),
  );

  if (fileArtifacts.length === 0) return null;

  return (
    <View className="mt-4 mb-2">
      <Pressable
        onPress={() => setExpanded(!expanded)}
        className="flex-row items-center justify-between py-2 mb-1"
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse file results' : 'Expand file results'}
      >
        <View className="flex-row items-center gap-2">
          <Layers size={13} color={colors.textMuted} />
          <Text className="text-xs text-white/50 uppercase tracking-wider">
            File Results ({fileArtifacts.length})
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={12} color={colors.textMuted} />
        ) : (
          <ChevronDown size={12} color={colors.textMuted} />
        )}
      </Pressable>

      {expanded && (
        <Card variant="outline">
          {fileArtifacts.map((art, idx) => (
            <View key={art.id}>
              {idx > 0 && (
                <View
                  style={{
                    height: 1,
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    marginVertical: 6,
                  }}
                />
              )}
              <View className="flex-row items-start gap-2">
                <View style={{ marginTop: 1 }}>
                  <ArtifactIcon type={art.type} />
                </View>
                <View className="flex-1">
                  <Text
                    className="text-[11px]"
                    style={{ color: getArtifactTextColor(art.type) }}
                    numberOfLines={1}
                  >
                    {art.label}
                  </Text>
                  <Text className="text-[10px] text-white/30" numberOfLines={1}>
                    {art.agentName}
                    {art.detail ? ` — ${art.detail}` : ''}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Task Results Section — completed task summaries with expandable details
// ---------------------------------------------------------------------------

interface TaskResultsSectionProps {
  agents: Agent[];
}

function TaskResultsSection({ agents }: TaskResultsSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const completedAgents = agents.filter((a) => a.status === 'completed' || a.status === 'failed');

  if (completedAgents.length === 0) return null;

  return (
    <View className="mt-2 mb-2">
      <View className="flex-row items-center gap-2 py-2 mb-1">
        <CheckCircle2 size={13} color={colors.textMuted} />
        <Text className="text-xs text-white/50 uppercase tracking-wider">
          Task Results ({completedAgents.length})
        </Text>
      </View>

      {completedAgents.map((agent) => {
        const isExpanded = expandedId === agent.id;
        const isSuccess = agent.status === 'completed';
        const borderColor = isSuccess ? 'rgba(16,185,129,0.20)' : 'rgba(239,68,68,0.20)';
        const statusColor = isSuccess ? colors.agentSuccess : colors.agentError;

        return (
          <Animated.View
            key={agent.id}
            entering={FadeIn.duration(200)}
            layout={LinearTransition.springify()}
            className="mb-2"
          >
            <Pressable
              onPress={() => setExpandedId(isExpanded ? null : agent.id)}
              accessibilityRole="button"
              accessibilityLabel={`${agent.name} task result, ${agent.status}. Tap to ${isExpanded ? 'collapse' : 'expand'}`}
            >
              <Card variant="outline" className="p-3" style={{ borderColor }}>
                <View className="flex-row items-center gap-2">
                  {isSuccess ? (
                    <CheckCircle2 size={14} color={statusColor} />
                  ) : (
                    <XCircle size={14} color={statusColor} />
                  )}
                  <Text className="text-sm font-medium text-white flex-1" numberOfLines={1}>
                    {agent.name}
                  </Text>
                  <Text className="text-[10px]" style={{ color: statusColor }}>
                    {isSuccess ? 'Done' : 'Failed'}
                  </Text>
                  {isExpanded ? (
                    <ChevronUp size={12} color={colors.textMuted} />
                  ) : (
                    <ChevronDown size={12} color={colors.textMuted} />
                  )}
                </View>

                {/* Expanded detail */}
                {isExpanded && (
                  <View className="mt-3">
                    {/* Summary stats */}
                    <View className="flex-row gap-4 mb-2">
                      {agent.totalSteps != null && (
                        <View>
                          <Text className="text-[10px] text-white/30">Steps</Text>
                          <Text className="text-xs text-white/70">
                            {agent.stepsCompleted ?? agent.totalSteps}/{agent.totalSteps}
                          </Text>
                        </View>
                      )}
                      {agent.toolCalls.length > 0 && (
                        <View>
                          <Text className="text-[10px] text-white/30">Tool Calls</Text>
                          <Text className="text-xs text-white/70">{agent.toolCalls.length}</Text>
                        </View>
                      )}
                      {(agent.artifacts ?? []).length > 0 && (
                        <View>
                          <Text className="text-[10px] text-white/30">Artifacts</Text>
                          <Text className="text-xs text-white/70">
                            {(agent.artifacts ?? []).length}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Last step message as summary */}
                    {agent.steps && agent.steps.length > 0 && (
                      <View className="px-2 py-1.5 rounded-lg bg-white/4">
                        <Text className="text-[11px] text-white/50" numberOfLines={3}>
                          {agent.steps[agent.steps.length - 1]?.message ?? ''}
                        </Text>
                      </View>
                    )}

                    {/* File artifacts produced */}
                    {agent.artifacts && agent.artifacts.length > 0 && (
                      <View className="mt-2">
                        <RunArtifactsList artifacts={agent.artifacts} maxVisible={3} />
                      </View>
                    )}
                  </View>
                )}
              </Card>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Agent Dashboard (main export)
// ---------------------------------------------------------------------------

export function AgentDashboard() {
  const agents = useAgentStore((s) => s.agents);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const selectAgent = useAgentStore((s) => s.selectAgent);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const router = useRouter();

  const hasRunningAgents = agents.some((a) => a.status === 'running' || a.status === 'waiting');

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

  const handleViewDetail = useCallback(
    (agentId: string) => {
      selectAgent(agentId);
      router.push(`/(app)/companion/agent/${agentId}` as Parameters<typeof router.push>[0]);
    },
    [selectAgent, router],
  );

  const handleEmergencyStop = useCallback(() => {
    Alert.alert(
      'Emergency Stop',
      'This will immediately cancel ALL running tasks on the desktop. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop Everything',
          style: 'destructive',
          onPress: () => {
            if (hapticsEnabled) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
            sendEmergencyStop();
          },
        },
      ],
    );
  }, [hapticsEnabled]);

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
    <View className="flex-1">
      <FlashList
        data={agents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: hasRunningAgents ? 88 : 24 }}
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
            onViewDetail={() => handleViewDetail(item.id)}
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
        ListFooterComponent={
          <View>
            <FileResultsSection agents={agents} />
            <TaskResultsSection agents={agents} />
            {/* Bottom padding accounts for emergency stop button */}
            <View style={{ height: hasRunningAgents ? 64 : 0 }} />
          </View>
        }
      />

      {/* Emergency stop — only shown when there are active agents */}
      {hasRunningAgents && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            right: 16,
          }}
        >
          <Pressable
            onPress={handleEmergencyStop}
            className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl active:opacity-80"
            style={{ backgroundColor: colors.agentError }}
            accessibilityLabel="Emergency stop — cancel all running tasks"
            accessibilityRole="button"
          >
            <AlertOctagon size={18} color="#fff" />
            <Text className="text-[15px] font-bold text-white">Emergency Stop</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
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

// Re-export for use in detail screen
export {
  RunArtifactsList,
  ToolCallLog,
  ArtifactIcon,
  ProgressBar,
  getTimeElapsed,
  estimateTimeRemaining,
};
