/**
 * ExecutionStream
 *
 * Real-time execution streaming display for a running desktop agent task.
 * Shows the live timeline of tool calls, step progress, and final outcome.
 * Connects to the companion WebSocket via the agent store which is kept
 * in sync by the connectionStore control-message handler.
 */
import { useEffect, useRef, useCallback } from 'react';
import { View, ScrollView } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
  useAnimatedStyle,
} from 'react-native-reanimated';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  Globe,
  Database,
  FileEdit,
  FilePlus,
  Zap,
  Clock,
  Camera,
  AlertCircle,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { useAgentStore } from '@/stores/agentStore';
import { colors } from '@/lib/theme';
import type { ToolCall } from '@/types/chat';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExecutionStreamProps {
  taskId: string;
  onComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Spinning loader icon
// ---------------------------------------------------------------------------

function SpinningLoader({ size = 14, color }: { size?: number; color: string }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(rotation);
    };
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Duration timer
// ---------------------------------------------------------------------------

function formatDuration(startedAt: string): string {
  try {
    const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    if (elapsed < 0) return '0s';
    if (elapsed < 60) return `${elapsed}s`;
    const minutes = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    if (minutes < 60) return `${minutes}m ${secs}s`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Tool call icon map
// ---------------------------------------------------------------------------

function ToolIcon({ name, size = 12 }: { name: string; size?: number }) {
  const lower = name.toLowerCase();

  if (lower.includes('file') && lower.includes('creat')) {
    return <FilePlus size={size} color={colors.agentSuccess} />;
  }
  if (lower.includes('file') || lower.includes('edit') || lower.includes('write')) {
    return <FileEdit size={size} color={colors.agentActive} />;
  }
  if (lower.includes('terminal') || lower.includes('command') || lower.includes('bash')) {
    return <Terminal size={size} color={colors.textMuted} />;
  }
  if (lower.includes('web') || lower.includes('browse') || lower.includes('http')) {
    return <Globe size={size} color={colors.agentActive} />;
  }
  if (lower.includes('db') || lower.includes('database') || lower.includes('sql')) {
    return <Database size={size} color={colors.agentWarning} />;
  }
  if (lower.includes('screenshot') || lower.includes('screen')) {
    return <Camera size={size} color={colors.textMuted} />;
  }
  if (lower.includes('error') || lower.includes('fail')) {
    return <AlertCircle size={size} color={colors.agentError} />;
  }
  return <Zap size={size} color={colors.textMuted} />;
}

// ---------------------------------------------------------------------------
// Single tool call row
// ---------------------------------------------------------------------------

interface ToolCallRowProps {
  call: ToolCall;
  isLatest: boolean;
}

function ToolCallRow({ call, isLatest }: ToolCallRowProps) {
  const statusColor =
    call.status === 'completed'
      ? colors.agentSuccess
      : call.status === 'failed'
        ? colors.agentError
        : colors.agentActive;

  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      layout={LinearTransition.springify()}
      className="flex-row items-start gap-2.5 mb-2.5"
    >
      {/* Timeline connector + status dot */}
      <View className="items-center" style={{ width: 20 }}>
        <View
          className="w-5 h-5 rounded-full items-center justify-center"
          style={{ backgroundColor: `${statusColor}18` }}
        >
          {call.status === 'running' ? (
            <SpinningLoader size={11} color={statusColor} />
          ) : call.status === 'completed' ? (
            <CheckCircle2 size={11} color={statusColor} />
          ) : (
            <XCircle size={11} color={statusColor} />
          )}
        </View>
        {/* Connector line below (only if not latest) */}
        {!isLatest && (
          <View
            style={{
              width: 1,
              flex: 1,
              minHeight: 12,
              backgroundColor: 'rgba(255,255,255,0.08)',
              marginTop: 3,
            }}
          />
        )}
      </View>

      {/* Content */}
      <View className="flex-1 pb-1">
        <View className="flex-row items-center gap-1.5 mb-0.5">
          <ToolIcon name={call.name} />
          <Text className="text-[12px] font-medium text-white/80 flex-1" numberOfLines={1}>
            {call.name}
            {call.command ? `: ${call.command}` : ''}
          </Text>
          {call.duration != null && (
            <Text className="text-[10px] text-white/30">{call.duration}ms</Text>
          )}
        </View>

        {/* Brief result */}
        {call.output && call.status !== 'running' && (
          <Text className="text-[11px] text-white/40 leading-4" numberOfLines={2}>
            {call.output}
          </Text>
        )}

        {/* File path hint */}
        {call.filePath && (
          <Text className="text-[10px] text-teal-400/70 mt-0.5" numberOfLines={1}>
            {call.filePath}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Completion / failure banner
// ---------------------------------------------------------------------------

function CompletionBanner({ status }: { status: 'completed' | 'failed' }) {
  const isSuccess = status === 'completed';
  const bgColor = isSuccess ? 'rgba(16, 185, 129, 0.10)' : 'rgba(239, 68, 68, 0.10)';
  const borderColor = isSuccess ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';
  const iconColor = isSuccess ? colors.agentSuccess : colors.agentError;

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-row items-center gap-2.5 px-3 py-2.5 rounded-xl mt-1"
      style={{ backgroundColor: bgColor, borderWidth: 1, borderColor }}
    >
      {isSuccess ? (
        <CheckCircle2 size={15} color={iconColor} />
      ) : (
        <XCircle size={15} color={iconColor} />
      )}
      <Text
        className="text-[12px] font-semibold flex-1"
        style={{ color: iconColor }}
        numberOfLines={1}
      >
        {isSuccess ? 'Task completed successfully' : 'Task failed'}
      </Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Main ExecutionStream component
// ---------------------------------------------------------------------------

export function ExecutionStream({ taskId, onComplete }: ExecutionStreamProps) {
  const agent = useAgentStore((state) => state.agents.find((a) => a.id === taskId));
  const scrollRef = useRef<ScrollView>(null);
  const prevStatusRef = useRef<string | undefined>(undefined);

  // Auto-scroll to bottom when new tool calls arrive
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [agent?.toolCalls.length]);

  // Fire onComplete callback when agent transitions to terminal state
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const currentStatus = agent?.status;
    prevStatusRef.current = currentStatus;

    if (prevStatus === 'running' && (currentStatus === 'completed' || currentStatus === 'failed')) {
      onComplete?.();
    }
  }, [agent?.status, onComplete]);

  const elapsedLabel = formatDuration(agent?.startedAt ?? new Date().toISOString());

  // Collect tool calls — most recent first (but show in chronological order)
  const toolCalls = agent?.toolCalls ?? [];

  if (!agent) {
    return (
      <Card className="items-center justify-center py-6">
        <Text className="text-sm text-white/40">Agent task not found.</Text>
      </Card>
    );
  }

  const isTerminal = agent.status === 'completed' || agent.status === 'failed';

  return (
    <Card variant="elevated">
      {/* Header row */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          {agent.status === 'running' ? (
            <SpinningLoader size={14} color={colors.agentActive} />
          ) : agent.status === 'completed' ? (
            <CheckCircle2 size={14} color={colors.agentSuccess} />
          ) : agent.status === 'failed' ? (
            <XCircle size={14} color={colors.agentError} />
          ) : (
            <Clock size={14} color={colors.agentWarning} />
          )}
          <Text className="text-sm font-semibold text-white" numberOfLines={1}>
            {agent.name}
          </Text>
        </View>

        {/* Elapsed timer */}
        <View className="flex-row items-center gap-1">
          <Clock size={10} color={colors.textMuted} />
          <Text className="text-[10px] text-white/40">{elapsedLabel}</Text>
        </View>
      </View>

      {/* Current action pill */}
      {agent.currentAction && agent.status === 'running' && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          layout={LinearTransition.springify()}
          className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-lg mb-3"
          style={{ backgroundColor: 'rgba(59,130,246,0.08)' }}
        >
          <Zap size={10} color={colors.agentActive} />
          <Text className="text-[11px] text-blue-400 flex-1" numberOfLines={1}>
            {agent.currentAction}
          </Text>
        </Animated.View>
      )}

      {/* Tool call timeline */}
      {toolCalls.length > 0 ? (
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: 300 }}
          contentContainerStyle={{ paddingTop: 2 }}
        >
          {toolCalls.map((call, idx) => (
            <ToolCallRow key={call.id} call={call} isLatest={idx === toolCalls.length - 1} />
          ))}
        </ScrollView>
      ) : (
        <View className="items-center py-4">
          {agent.status === 'running' ? (
            <View className="flex-row items-center gap-2">
              <SpinningLoader size={13} color={colors.agentActive} />
              <Text className="text-xs text-white/40">Waiting for tool calls...</Text>
            </View>
          ) : (
            <Text className="text-xs text-white/30">No tool calls recorded.</Text>
          )}
        </View>
      )}

      {/* Completion banner */}
      {isTerminal && <CompletionBanner status={agent.status as 'completed' | 'failed'} />}
    </Card>
  );
}
