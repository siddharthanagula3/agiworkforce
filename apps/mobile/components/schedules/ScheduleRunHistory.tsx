/**
 * Schedule Run History
 *
 * Shows the last 5 runs for a schedule with success/failure status,
 * timestamps, and optional error message. Fetches runs on mount if not
 * already loaded.
 */
import { useEffect, useCallback } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { CheckCircle2, XCircle, Clock, RefreshCw, Loader } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useScheduleStore, type ScheduleRun } from '@/stores/scheduleStore';
import { colors } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Single run row
// ---------------------------------------------------------------------------

interface RunRowProps {
  run: ScheduleRun;
}

function RunRow({ run }: RunRowProps) {
  const isSuccess = run.status === 'success';
  const isFailed = run.status === 'failed';
  const isRunning = run.status === 'running';
  const isPending = run.status === 'pending';

  const StatusIcon = isSuccess
    ? CheckCircle2
    : isFailed
      ? XCircle
      : isRunning
        ? Loader
        : Clock;

  const iconColor = isSuccess
    ? colors.agentSuccess
    : isFailed
      ? colors.agentError
      : isRunning
        ? colors.teal
        : colors.textMuted;

  const duration = formatDuration(run.startedAt, run.completedAt);
  const timeLabel = formatRunTime(run.startedAt);

  return (
    <View className="flex-row items-start gap-3 py-2">
      <StatusIcon size={15} color={iconColor} style={{ marginTop: 1 }} />
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text
            className="text-[13px] font-medium"
            style={{ color: isSuccess ? colors.agentSuccess : isFailed ? colors.agentError : colors.textSecondary }}
          >
            {isSuccess ? 'Success' : isFailed ? 'Failed' : isRunning ? 'Running' : 'Pending'}
          </Text>
          {duration ? (
            <Text className="text-[11px] text-white/30">{duration}</Text>
          ) : null}
        </View>
        {run.error ? (
          <Text className="text-[11px] text-red-400/70 mt-0.5 leading-4" numberOfLines={2}>
            {run.error}
          </Text>
        ) : null}
        <Text className="text-[10px] text-white/30 mt-0.5">{timeLabel}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ScheduleRunHistoryProps {
  scheduleId: string;
  /** Max runs to display (default: 5) */
  maxRuns?: number;
}

export function ScheduleRunHistory({ scheduleId, maxRuns = 5 }: ScheduleRunHistoryProps) {
  const fetchRuns = useScheduleStore((s) => s.fetchRuns);
  const getRuns = useScheduleStore((s) => s.getRuns);
  const loading = useScheduleStore((s) => s.loading);

  const allRuns = getRuns(scheduleId);
  const runs = allRuns.slice(0, maxRuns);

  useEffect(() => {
    // Always refresh on mount to get latest run status
    fetchRuns(scheduleId);
  }, [scheduleId, fetchRuns]);

  const handleRefresh = useCallback(() => {
    fetchRuns(scheduleId);
  }, [scheduleId, fetchRuns]);

  return (
    <Animated.View entering={FadeIn.duration(200)}>
      {/* Section header */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-[11px] text-white/40 uppercase tracking-wider">Run History</Text>
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
      {runs.length === 0 ? (
        <View className="py-3 items-center">
          <Text className="text-[12px] text-white/30">No runs yet</Text>
        </View>
      ) : (
        <View>
          {runs.map((run, idx) => (
            <View key={run.id}>
              {idx > 0 && (
                <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 1 }} />
              )}
              <RunRow run={run} />
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}
