import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Flag,
  Loader,
  ShieldQuestion,
  XCircle,
  type LucideIcon,
} from 'lucide-react-native';
import { runStatusLabel } from '@agiworkforce/types';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { Skeleton } from '@/components/ui/Skeleton';
import { CloudSchedulesGate, useScheduleStore } from '@/src/features/schedules';
import type { RecentScheduleRun } from '@/src/features/schedules/store';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { HEADER_TEXT_SCALE_LIMIT } from '@/src/features/chat/components/WorkModeSwitch';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';
import { ReportSheet, type ReportTarget } from '@/src/features/chat/components/ReportFlagButton';

const END_REACHED_THRESHOLD = 0.4;
const REPORT_THIS_RUN = 'Report this run';

function recentRunReportTarget(run: RecentScheduleRun, summary: string): ReportTarget {
  return {
    messageId: `schedule-run:${run.id}`,
    conversationId: `schedule:${run.scheduleId}`,
    contentExcerpt: summary,
    subject: { kind: 'schedule-run', id: run.id },
  };
}

function formatRunStart(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusLabel(status: RecentScheduleRun['status']): string {
  switch (status) {
    case 'success':
      return runStatusLabel('completed');
    case 'failed':
      return runStatusLabel('failed');
    case 'cancelled':
      return runStatusLabel('cancelled');
    case 'timeout':
      return 'Timed out';
    case 'awaiting_approval':
      return 'Needs approval';
    case 'running':
      return runStatusLabel('running');
  }
}

export default function ScheduledRunsScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const isCloudMode = appMode === 'cloud';
  const cloudReady = FEATURES.schedules && isCloudMode && cloudUnlocked;

  const runs = useScheduleStore((s) => s.recentRuns);
  const cursor = useScheduleStore((s) => s.recentRunsCursor);
  const loading = useScheduleStore((s) => s.recentRunsLoading);
  const loadingMore = useScheduleStore((s) => s.recentRunsLoadingMore);
  const error = useScheduleStore((s) => s.recentRunsError);
  const refreshFailed = useScheduleStore((s) => s.recentRunsErrorSource === 'refresh');
  const fetchRecentRuns = useScheduleStore((s) => s.fetchRecentRuns);
  const fetchMoreRecentRuns = useScheduleStore((s) => s.fetchMoreRecentRuns);

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (cloudReady) void fetchRecentRuns();
  }, [cloudReady, fetchRecentRuns]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchRecentRuns();
    } finally {
      setRefreshing(false);
    }
  }, [fetchRecentRuns]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/schedules' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleActivateCloud = useCallback(() => {
    if (!cloudUnlocked) {
      router.push(beginCloudPostAuthIntent('cloud-schedules'));
      return;
    }
    setAppMode('cloud');
  }, [cloudUnlocked, router, setAppMode]);

  const handleOpenSchedule = useCallback(
    (scheduleId: string) => {
      router.push({ pathname: '/(app)/schedules/create' as const, params: { id: scheduleId } });
    },
    [router],
  );

  const handleEndReached = useCallback(() => {
    void fetchMoreRecentRuns();
  }, [fetchMoreRecentRuns]);

  const handleRetryFooter = useCallback(() => {
    if (refreshFailed) void fetchRecentRuns();
    else void fetchMoreRecentRuns();
  }, [fetchMoreRecentRuns, fetchRecentRuns, refreshFailed]);

  if (!FEATURES.schedules) return <FeatureUnavailable feature="Scheduled tasks" />;
  if (!isCloudMode || !cloudUnlocked) {
    return (
      <CloudSchedulesGate
        signedIn={cloudUnlocked}
        onBack={handleBack}
        onContinue={handleActivateCloud}
      />
    );
  }

  const initialLoad = loading && runs.length === 0 && !refreshing;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      <View testID="schedule-runs-header" className="min-h-12 flex-row items-center px-3">
        <PressableBox
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </PressableBox>
        <Text
          variant="subheading"
          accessibilityRole="header"
          maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
          style={{ flex: 1, textAlign: 'center' }}
        >
          Scheduled runs
        </Text>
        <View style={{ width: 36, height: 36 }} />
      </View>

      {initialLoad ? (
        <View className="mt-2 gap-3 px-4" accessibilityLabel="Loading scheduled runs">
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              className="rounded-xl p-4"
              style={{ backgroundColor: colors.surfaceOverlay }}
            >
              <Skeleton width="55%" height={18} className="mb-3" />
              <Skeleton width="35%" height={14} />
            </View>
          ))}
        </View>
      ) : error && runs.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text variant="heading" className="text-center">
            Scheduled runs could not be loaded
          </Text>
          <Text className="mt-2 text-center text-sm leading-5" style={{ color: colors.textMuted }}>
            {error}
          </Text>
          <PressableBox
            onPress={() => void fetchRecentRuns()}
            className="mt-6 min-h-[48px] min-w-[180px] items-center justify-center rounded-xl"
            style={{ backgroundColor: colors.teal }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading scheduled runs"
          >
            <Text className="font-semibold" style={{ color: colors.accentText }}>
              Try Again
            </Text>
          </PressableBox>
        </View>
      ) : runs.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text variant="heading" className="text-center">
            No scheduled runs
          </Text>
          <Text className="mt-2 text-center text-sm leading-5" style={{ color: colors.textMuted }}>
            Runs from your scheduled tasks appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={runs}
          keyExtractor={(run) => run.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 10 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
              progressBackgroundColor={colors.surfaceElevated}
            />
          }
          onEndReached={cursor ? handleEndReached : undefined}
          onEndReachedThreshold={END_REACHED_THRESHOLD}
          renderItem={({ item }) => <RunRow run={item} onPress={handleOpenSchedule} />}
          ListFooterComponent={
            loadingMore || (loading && !refreshing) ? (
              <LoadingIndicator className="py-4" />
            ) : error ? (
              <PressableBox
                onPress={handleRetryFooter}
                className="min-h-[44px] items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel={
                  refreshFailed
                    ? 'Retry loading scheduled runs'
                    : 'Retry loading more scheduled runs'
                }
              >
                <Text className="text-sm" style={{ color: colors.agentError }}>
                  {error}
                </Text>
              </PressableBox>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function RunRow({
  run,
  onPress,
}: {
  run: RecentScheduleRun;
  onPress: (scheduleId: string) => void;
}) {
  const colors = useThemeColors();
  const failed = run.status === 'failed' || run.status === 'timeout' || run.status === 'cancelled';
  const StatusIcon: LucideIcon =
    run.status === 'success'
      ? CheckCircle2
      : failed
        ? XCircle
        : run.status === 'running'
          ? Loader
          : run.status === 'awaiting_approval'
            ? ShieldQuestion
            : Clock;
  const tone =
    run.status === 'success'
      ? colors.agentSuccess
      : failed
        ? colors.agentError
        : run.status === 'awaiting_approval'
          ? colors.agentWarning
          : colors.textMuted;
  const label = statusLabel(run.status);
  const started = formatRunStart(run.startedAt);
  const summary = run.summary?.trim() ? run.summary : null;
  const [reporting, setReporting] = useState(false);

  return (
    <View
      className="flex-row items-end rounded-xl"
      style={{ backgroundColor: colors.surfaceOverlay }}
    >
      <PressableBox
        onPress={() => onPress(run.scheduleId)}
        className="flex-1 px-4 py-3 active:opacity-80"
        accessibilityRole="button"
        accessibilityLabel={`${run.scheduleName}, ${label}${started ? `, ${started}` : ''}`}
        accessibilityHint="Opens this scheduled task"
      >
        <View className="flex-row items-center gap-2">
          <StatusIcon size={16} color={tone} />
          <Text
            className="flex-1 font-semibold"
            numberOfLines={1}
            style={{ color: colors.textPrimary }}
          >
            {run.scheduleName}
          </Text>
          <Text className="text-sm" style={{ color: tone }}>
            {label}
          </Text>
        </View>
        {started ? (
          <Text className="mt-1 text-sm" style={{ color: colors.textMuted }}>
            {started}
          </Text>
        ) : null}
        {run.summary ? (
          <Text
            className="mt-1 text-sm leading-5"
            numberOfLines={2}
            style={{ color: colors.textSecondary }}
          >
            {run.summary}
          </Text>
        ) : null}
      </PressableBox>
      {summary ? (
        <PressableBox
          testID={`recent-run-report-${run.id}`}
          onPress={() => setReporting(true)}
          accessibilityRole="button"
          accessibilityLabel={REPORT_THIS_RUN}
          style={{
            width: FULL_SCREEN_TOUCH_TARGET,
            height: FULL_SCREEN_TOUCH_TARGET,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Flag size={14} color={colors.textMuted} />
        </PressableBox>
      ) : null}
      {summary && reporting ? (
        <ReportSheet
          visible
          onClose={() => setReporting(false)}
          title={REPORT_THIS_RUN}
          target={recentRunReportTarget(run, summary)}
        />
      ) : null}
    </View>
  );
}
