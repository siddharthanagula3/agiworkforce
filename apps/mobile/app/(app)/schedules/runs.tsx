import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader,
  ShieldQuestion,
  XCircle,
  type LucideIcon,
} from 'lucide-react-native';
import { runStatusLabel } from '@agiworkforce/types';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { CloudSchedulesGate, useScheduleStore } from '@/src/features/schedules';
import type { RecentScheduleRun } from '@/src/features/schedules/store';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';

const END_REACHED_THRESHOLD = 0.4;

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
      <View className="h-12 flex-row items-center px-3">
        <PressableBox
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </PressableBox>
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }}
        >
          <Text variant="subheading" accessibilityRole="header">
            Scheduled runs
          </Text>
        </View>
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
            loadingMore ? (
              <ActivityIndicator className="py-4" color={colors.textMuted} />
            ) : error ? (
              <PressableBox
                onPress={handleEndReached}
                className="min-h-[44px] items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel="Retry loading more scheduled runs"
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

  return (
    <PressableBox
      onPress={() => onPress(run.scheduleId)}
      className="rounded-xl px-4 py-3 active:opacity-80"
      style={{ backgroundColor: colors.surfaceOverlay }}
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
  );
}
