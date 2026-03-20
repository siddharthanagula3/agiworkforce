/**
 * Agent Detail Screen
 *
 * Full-screen view of a single agent: progress, current action,
 * run artifacts, expandable tool call log, and controls.
 * Accessible by tapping the ChevronRight on an agent card.
 */
import { useCallback } from 'react';
import { View, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft,
  Bot,
  Pause,
  Play,
  Square,
  Timer,
  Zap,
  FilePlus,
  FileEdit,
  AlertCircle,
  Terminal,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  RunArtifactsList,
  ToolCallLog,
  ProgressBar,
  getTimeElapsed,
  estimateTimeRemaining,
} from '@/components/companion/AgentDashboard';
import { useAgentStore } from '@/stores/agentStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';
import { sendAgentCommand, requestAgentRefresh } from '@/services/companion';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function AgentStatusIcon({ status }: { status: 'running' | 'completed' | 'failed' | 'waiting' }) {
  switch (status) {
    case 'running':
      return <Loader2 size={20} color={colors.agentActive} />;
    case 'completed':
      return <CheckCircle2 size={20} color={colors.agentSuccess} />;
    case 'failed':
      return <XCircle size={20} color={colors.agentError} />;
    case 'waiting':
      return <Clock size={20} color={colors.agentWarning} />;
    default:
      return <Bot size={20} color={colors.textMuted} />;
  }
}

function getStatusBadgeColor(
  status: 'running' | 'completed' | 'failed' | 'waiting',
): 'blue' | 'green' | 'red' | 'yellow' {
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
// Agent Detail Screen
// ---------------------------------------------------------------------------

export default function AgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const agent = useAgentStore((s) => s.agents.find((a) => a.id === id));
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/companion' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleCommand = useCallback(
    (command: 'pause' | 'resume' | 'cancel') => {
      if (!agent) return;
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      sendAgentCommand(agent.id, command);
    },
    [agent, hapticsEnabled],
  );

  const handleCancelWithConfirm = useCallback(() => {
    if (!agent) return;
    Alert.alert('Cancel Task', `Are you sure you want to cancel "${agent.name}"?`, [
      { text: 'Keep Running', style: 'cancel' },
      {
        text: 'Cancel Task',
        style: 'destructive',
        onPress: () => handleCommand('cancel'),
      },
    ]);
  }, [agent, handleCommand]);

  const handleRefresh = useCallback(() => {
    requestAgentRefresh();
  }, []);

  // Agent not found — may have been removed
  if (!agent) {
    return (
      <SafeAreaView className="flex-1 bg-surface-base">
        <View className="flex-row items-center px-3 h-12">
          <Pressable
            onPress={handleBack}
            className="p-2 rounded-lg active:bg-white/5"
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={20} color={colors.textSecondary} />
          </Pressable>
          <Text variant="subheading" className="ml-2 flex-1">
            Agent Detail
          </Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Bot size={40} color={colors.textMuted} />
          <Text className="text-white/50 text-center text-sm mt-4">
            This agent is no longer running.
          </Text>
          <Pressable
            onPress={handleBack}
            className="mt-4 px-5 py-2.5 rounded-xl bg-teal-500/10 active:bg-teal-500/20"
            accessibilityRole="button"
          >
            <Text className="text-teal-400 text-sm font-medium">Back to Dashboard</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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

  const isControllable = agent.status === 'running' || agent.status === 'waiting';

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center px-3 h-12">
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2 flex-1" numberOfLines={1}>
          {agent.name}
        </Text>
        <Pressable
          onPress={handleRefresh}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Refresh agent status"
          accessibilityRole="button"
        >
          <RefreshCw size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status card */}
        <Animated.View entering={FadeIn.duration(200)}>
          <Card variant="elevated" className="mb-4">
            {/* Agent name + status */}
            <View className="flex-row items-center gap-3 mb-3">
              <View className="w-10 h-10 rounded-xl bg-white/5 items-center justify-center">
                <AgentStatusIcon status={agent.status} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                  {agent.name}
                </Text>
                <Text className="text-xs text-white/40">{agent.model}</Text>
              </View>
              <Badge label={agent.status} color={getStatusBadgeColor(agent.status)} />
            </View>

            <Separator className="mb-3" />

            {/* Timing row */}
            <View className="flex-row items-center gap-4 mb-3">
              <View className="flex-row items-center gap-1.5">
                <Clock size={12} color={colors.textMuted} />
                <Text className="text-xs text-white/50">Elapsed: {timeElapsed}</Text>
              </View>
              {eta && (
                <View className="flex-row items-center gap-1.5">
                  <Timer size={12} color={colors.textMuted} />
                  <Text className="text-xs text-white/50">{eta}</Text>
                </View>
              )}
            </View>

            {/* Progress bar */}
            {(agent.status === 'running' || agent.status === 'waiting') && (
              <View className="mb-3">
                <ProgressBar progress={agent.progress} />
                <View className="flex-row items-center justify-between mt-1.5">
                  {agent.totalSteps != null && agent.stepsCompleted != null ? (
                    <Text className="text-[10px] text-white/40">
                      Step {agent.stepsCompleted} of {agent.totalSteps}
                    </Text>
                  ) : (
                    <View />
                  )}
                  <Text className="text-[10px] text-white/40">{agent.progress}%</Text>
                </View>
              </View>
            )}

            {/* Current action */}
            {agent.currentAction ? (
              <View className="flex-row items-center gap-1.5 px-2 py-1.5 rounded-lg bg-blue-500/8">
                <Zap size={11} color={colors.agentActive} />
                <Text className="text-[11px] text-blue-400 flex-1" numberOfLines={2}>
                  {agent.currentAction}
                </Text>
              </View>
            ) : agent.currentStep ? (
              <Text className="text-xs text-white/60" numberOfLines={3}>
                {agent.currentStep}
              </Text>
            ) : null}
          </Card>
        </Animated.View>

        {/* Controls */}
        {isControllable && (
          <Animated.View entering={FadeIn.duration(200).delay(60)} className="mb-4">
            <Text className="text-xs text-white/40 uppercase tracking-wider mb-2">Controls</Text>
            <View className="flex-row gap-3">
              {agent.status === 'running' ? (
                <Pressable
                  onPress={() => handleCommand('pause')}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-amber-500/10 active:bg-amber-500/20"
                  accessibilityLabel="Pause agent"
                  accessibilityRole="button"
                >
                  <Pause size={14} color={colors.agentWarning} />
                  <Text className="text-sm text-amber-400 font-medium">Pause</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => handleCommand('resume')}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-teal-500/10 active:bg-teal-500/20"
                  accessibilityLabel="Resume agent"
                  accessibilityRole="button"
                >
                  <Play size={14} color={colors.teal} />
                  <Text className="text-sm text-teal-400 font-medium">Resume</Text>
                </Pressable>
              )}
              <Pressable
                onPress={handleCancelWithConfirm}
                className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 active:bg-red-500/20"
                accessibilityLabel="Cancel agent"
                accessibilityRole="button"
              >
                <Square size={14} color={colors.agentError} />
                <Text className="text-sm text-red-400 font-medium">Cancel</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {/* Run Artifacts */}
        {agent.artifacts && agent.artifacts.length > 0 && (
          <Animated.View entering={FadeIn.duration(200).delay(80)} className="mb-4">
            <Text className="text-xs text-white/40 uppercase tracking-wider mb-2">
              Run Artifacts ({agent.artifacts.length})
            </Text>
            <Card variant="default">
              {agent.artifacts.map((artifact, index) => {
                const isLast = index === agent.artifacts!.length - 1;
                return (
                  <View key={artifact.id}>
                    <View className="flex-row items-start gap-2 py-2">
                      <ArtifactTypeIcon type={artifact.type} />
                      <View className="flex-1">
                        <Text className="text-xs text-white/80" numberOfLines={1}>
                          {artifact.label}
                        </Text>
                        {artifact.detail && (
                          <Text className="text-[10px] text-white/40 mt-0.5" numberOfLines={2}>
                            {artifact.detail}
                          </Text>
                        )}
                        <Text className="text-[10px] text-white/30 mt-0.5">
                          {formatArtifactTime(artifact.timestamp)}
                        </Text>
                      </View>
                    </View>
                    {!isLast && <Separator />}
                  </View>
                );
              })}
            </Card>
          </Animated.View>
        )}

        {/* Tool Call Log */}
        {agent.toolCalls && agent.toolCalls.length > 0 && (
          <Animated.View entering={FadeIn.duration(200).delay(100)} className="mb-4">
            <Text className="text-xs text-white/40 uppercase tracking-wider mb-2">
              Tool Calls ({agent.toolCalls.length})
            </Text>
            <Card variant="default">
              <ToolCallLog toolCalls={agent.toolCalls} maxVisible={10} />
            </Card>
          </Animated.View>
        )}

        {/* Steps */}
        {agent.steps && agent.steps.length > 0 && (
          <Animated.View entering={FadeIn.duration(200).delay(120)}>
            <Text className="text-xs text-white/40 uppercase tracking-wider mb-2">
              Steps ({agent.steps.length})
            </Text>
            <Card variant="default">
              {agent.steps.map((step, index) => {
                const isLast = index === agent.steps.length - 1;
                return (
                  <View key={step.id}>
                    <View className="flex-row items-start gap-2.5 py-2">
                      <View
                        className="w-2 h-2 rounded-full mt-1.5"
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
                        <Text className="text-xs text-white/80">{step.message}</Text>
                        {step.detail && (
                          <Text className="text-[11px] text-white/50 mt-0.5" numberOfLines={2}>
                            {step.detail}
                          </Text>
                        )}
                      </View>
                      <View
                        className="px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor:
                            step.status === 'completed'
                              ? `${colors.agentSuccess}20`
                              : step.status === 'failed'
                                ? `${colors.agentError}20`
                                : `${colors.agentActive}20`,
                        }}
                      >
                        <Text
                          className="text-[9px] uppercase"
                          style={{
                            color:
                              step.status === 'completed'
                                ? colors.agentSuccess
                                : step.status === 'failed'
                                  ? colors.agentError
                                  : colors.agentActive,
                          }}
                        >
                          {step.status}
                        </Text>
                      </View>
                    </View>
                    {!isLast && <Separator />}
                  </View>
                );
              })}
            </Card>
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ArtifactTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'file_created':
      return (
        <View
          className="w-7 h-7 rounded-lg items-center justify-center"
          style={{ backgroundColor: `${colors.agentSuccess}20` }}
        >
          <FilePlus size={13} color={colors.agentSuccess} />
        </View>
      );
    case 'file_modified':
      return (
        <View
          className="w-7 h-7 rounded-lg items-center justify-center"
          style={{ backgroundColor: `${colors.agentActive}20` }}
        >
          <FileEdit size={13} color={colors.agentActive} />
        </View>
      );
    case 'command_run':
      return (
        <View className="w-7 h-7 rounded-lg items-center justify-center bg-white/5">
          <Terminal size={13} color={colors.textMuted} />
        </View>
      );
    case 'error':
      return (
        <View
          className="w-7 h-7 rounded-lg items-center justify-center"
          style={{ backgroundColor: `${colors.agentError}20` }}
        >
          <AlertCircle size={13} color={colors.agentError} />
        </View>
      );
    default:
      return (
        <View className="w-7 h-7 rounded-lg items-center justify-center bg-white/5">
          <Terminal size={13} color={colors.textMuted} />
        </View>
      );
  }
}

function formatArtifactTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
