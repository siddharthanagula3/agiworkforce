import { useEffect, useCallback } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  Check,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Loader,
  ShieldQuestion,
  X,
} from 'lucide-react-native';
import { runStatusLabel, TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { PressableBox } from '@/components/ui/pressable-box';
import { useThemeColors, motion } from '@/src/ui/theme';
import { useScheduleStore, type ScheduleRun } from '../store';

function formatRunTime(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay === 1) return 'yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '';
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return '<1s';
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
  } catch {
    return '';
  }
}

const TIMED_OUT_STATUS_LABEL = 'Timed out';
const AWAITING_APPROVAL_STATUS_LABEL = 'Needs approval';

interface RunRowProps {
  run: ScheduleRun;
}

function PendingApproval({ run }: RunRowProps) {
  const colors = useThemeColors();
  const resolveRunApproval = useScheduleStore((s) => s.resolveRunApproval);
  const sending = useScheduleStore((s) => s.approvalPendingByRun[run.id] ?? false);
  const pending = run.pendingApproval;
  if (!pending) return null;
  return (
    <View
      className="mt-1.5 rounded-lg px-2.5 py-2"
      style={{ borderWidth: 1, borderColor: colors.agentWarning }}
    >
      {pending.toolCalls.map((call) => (
        <View key={call.id} className="mb-1.5">
          <Text className="text-[12px] font-medium" style={{ color: colors.textPrimary }}>
            {call.summary}
          </Text>
          <Text className="text-xs" style={{ color: colors.textMuted }} numberOfLines={1}>
            {call.name}
          </Text>
          {call.input ? (
            <Text
              className="text-xs mt-0.5 leading-4"
              style={{ color: colors.textSecondary }}
              numberOfLines={6}
            >
              {call.input}
            </Text>
          ) : null}
        </View>
      ))}
      <View className="flex-row gap-2 mt-1">
        <PressableBox
          onPress={() => void resolveRunApproval(run.scheduleId, run.id, 'approved')}
          disabled={sending}
          className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg active:opacity-80"
          style={{ backgroundColor: colors.teal, opacity: sending ? 0.6 : 1 }}
          accessibilityRole="button"
          accessibilityLabel={`${TOOL_APPROVAL_ACTION_LABELS.approve} the step this run is waiting on`}
          accessibilityState={{ disabled: sending, busy: sending }}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.accentText} />
          ) : (
            <Check size={14} color={colors.accentText} />
          )}
          <Text className="text-[13px] font-semibold" style={{ color: colors.accentText }}>
            {TOOL_APPROVAL_ACTION_LABELS.approve}
          </Text>
        </PressableBox>
        <PressableBox
          onPress={() => void resolveRunApproval(run.scheduleId, run.id, 'rejected')}
          disabled={sending}
          className="flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg border active:opacity-80"
          style={{ borderColor: colors.agentError, opacity: sending ? 0.6 : 1 }}
          accessibilityRole="button"
          accessibilityLabel={`${TOOL_APPROVAL_ACTION_LABELS.deny} the step this run is waiting on`}
          accessibilityState={{ disabled: sending, busy: sending }}
        >
          <X size={14} color={colors.agentError} />
          <Text className="text-[13px] font-semibold" style={{ color: colors.agentError }}>
            {TOOL_APPROVAL_ACTION_LABELS.deny}
          </Text>
        </PressableBox>
      </View>
    </View>
  );
}

function RunRow({ run }: RunRowProps) {
  const colors = useThemeColors();
  const isAwaitingApproval = run.status === 'awaiting_approval';
  const isSuccess = run.status === 'success';
  const isFailed = run.status === 'failed';
  const isRunning = run.status === 'running';
  const isTimeout = run.status === 'timeout';
  const isCancelled = run.status === 'cancelled';
  const isTerminalFailure = isFailed || isTimeout || isCancelled;

  const StatusIcon = isAwaitingApproval
    ? ShieldQuestion
    : isSuccess
      ? CheckCircle2
      : isTerminalFailure
        ? XCircle
        : isRunning
          ? Loader
          : Clock;

  const iconColor = isAwaitingApproval
    ? colors.agentWarning
    : isSuccess
      ? colors.agentSuccess
      : isTerminalFailure
        ? colors.agentError
        : isRunning
          ? colors.teal
          : colors.textMuted;

  const statusLabel = isAwaitingApproval
    ? AWAITING_APPROVAL_STATUS_LABEL
    : isSuccess
      ? runStatusLabel('completed')
      : isFailed
        ? runStatusLabel('failed')
        : isTimeout
          ? TIMED_OUT_STATUS_LABEL
          : isCancelled
            ? runStatusLabel('cancelled')
            : runStatusLabel('running');

  const duration = formatDuration(run.startedAt, run.completedAt);
  const timeLabel = formatRunTime(run.startedAt);

  return (
    <View className="flex-row items-start gap-3 py-2">
      <StatusIcon size={15} color={iconColor} style={{ marginTop: 1 }} />
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text
            className="text-[13px] font-medium"
            style={{
              color: isAwaitingApproval
                ? colors.agentWarning
                : isSuccess
                  ? colors.agentSuccess
                  : isTerminalFailure
                    ? colors.agentError
                    : colors.textSecondary,
            }}
          >
            {statusLabel}
          </Text>
          {duration ? <Text className="text-xs text-white/30">{duration}</Text> : null}
        </View>
        {run.timingNote ? (
          <Text className="text-[12px] mt-1 leading-[18px]" style={{ color: colors.textMuted }}>
            {run.timingNote}
          </Text>
        ) : null}
        {isAwaitingApproval ? <PendingApproval run={run} /> : null}
        {run.result ? (
          <Text
            selectable
            className="text-[12px] mt-1 leading-[18px]"
            style={{ color: colors.textSecondary }}
            numberOfLines={6}
          >
            {run.result}
          </Text>
        ) : null}
        {run.error ? (
          <Text className="text-xs text-red-400/70 mt-0.5 leading-4" numberOfLines={2}>
            {run.error}
          </Text>
        ) : null}
        <Text className="text-xs text-white/30 mt-0.5">{timeLabel}</Text>
      </View>
    </View>
  );
}

interface ScheduleRunHistoryProps {
  scheduleId: string;
  maxRuns?: number;
}

export function ScheduleRunHistory({ scheduleId, maxRuns = 5 }: ScheduleRunHistoryProps) {
  const colors = useThemeColors();
  const fetchRuns = useScheduleStore((s) => s.fetchRuns);
  const getRuns = useScheduleStore((s) => s.getRuns);
  const loading = useScheduleStore((s) => s.runsLoadingBySchedule[scheduleId] ?? false);
  const error = useScheduleStore((s) => s.runsErrorBySchedule[scheduleId] ?? null);

  const allRuns = getRuns(scheduleId);
  const runs = allRuns.slice(0, maxRuns);

  useEffect(() => {
    fetchRuns(scheduleId);
  }, [scheduleId, fetchRuns]);

  const handleRefresh = useCallback(() => {
    fetchRuns(scheduleId);
  }, [scheduleId, fetchRuns]);

  return (
    <Animated.View entering={FadeIn.duration(motion.quick)}>
      {/* Section header */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs text-white/40 uppercase tracking-wider">Run History</Text>
        <Pressable
          onPress={handleRefresh}
          className="p-1 rounded active:opacity-60"
          accessibilityLabel="Refresh run history"
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <RefreshCw size={13} color={colors.textMuted} />
          )}
        </Pressable>
      </View>

      {/* Runs or empty state */}
      {loading && runs.length === 0 ? (
        <View className="py-3 items-center">
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text className="text-[12px] text-white/30 mt-2">Loading runs…</Text>
        </View>
      ) : error && runs.length === 0 ? (
        <Pressable
          onPress={handleRefresh}
          className="py-3 items-center"
          accessibilityRole="button"
          accessibilityLabel="Retry run history"
        >
          <Text className="text-[12px] text-red-400">Run history unavailable. Try again.</Text>
        </Pressable>
      ) : runs.length === 0 ? (
        <View className="py-3 items-center">
          <Text className="text-[12px] text-white/30">No runs yet</Text>
        </View>
      ) : (
        <View>
          {runs.map((run, idx) => (
            <View key={run.id}>
              {idx > 0 && (
                <View
                  style={{
                    height: 1,
                    backgroundColor: colors.borderLight,
                    marginVertical: 1,
                  }}
                />
              )}
              <RunRow run={run} />
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}
