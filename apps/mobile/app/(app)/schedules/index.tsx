import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, FlatList, RefreshControl, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Plus, Calendar } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CloudSchedulesGate,
  ScheduleCard,
  QuickSchedule,
  SCHEDULE_TEMPLATES,
  useScheduleStore,
  type ScheduleTemplate,
} from '@/src/features/schedules';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';
import { getPlanMaxScheduledTasks } from '@agiworkforce/types';

const SCHEDULE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
] as const;

type ScheduleFilter = (typeof SCHEDULE_FILTERS)[number]['key'];

export default function SchedulesScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const tier = useTierStore((s) => s.tier);
  const isCloudMode = appMode === 'cloud';
  const scheduledTaskLimit = getPlanMaxScheduledTasks(tier);
  const canCreateSchedule = scheduledTaskLimit === null || scheduledTaskLimit > 0;

  const { schedules, loading, error, fetchSchedules, toggleSchedule, deleteSchedule, clearError } =
    useScheduleStore();

  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ScheduleFilter>('all');

  const visibleSchedules = useMemo(
    () =>
      filter === 'all'
        ? schedules
        : schedules.filter((schedule) => schedule.isActive === (filter === 'active')),
    [filter, schedules],
  );

  useEffect(() => {
    if (FEATURES.schedules && isCloudMode && cloudUnlocked) void fetchSchedules();
  }, [cloudUnlocked, fetchSchedules, isCloudMode]);

  const handleRefresh = useCallback(async () => {
    if (!FEATURES.schedules || !isCloudMode || !cloudUnlocked) return;
    setRefreshing(true);
    try {
      await fetchSchedules();
    } finally {
      setRefreshing(false);
    }
  }, [cloudUnlocked, fetchSchedules, isCloudMode]);

  const openCreate = useCallback(
    (templateId?: ScheduleTemplate['id']) => {
      if (!canCreateSchedule) {
        router.push('/(app)/settings/cloud-billing' as Parameters<typeof router.push>[0]);
        return;
      }
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      if (templateId) {
        router.push({
          pathname: '/(app)/schedules/create' as const,
          params: { template: templateId },
        });
        return;
      }
      router.push({ pathname: '/(app)/schedules/create' as const });
    },
    [canCreateSchedule, hapticsEnabled, router],
  );

  const handleCreate = useCallback(() => {
    openCreate();
  }, [openCreate]);

  const handleUseTemplate = useCallback(
    (templateId: ScheduleTemplate['id']) => {
      openCreate(templateId);
    },
    [openCreate],
  );

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleActivateCloud = useCallback(() => {
    if (!cloudUnlocked) {
      router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
      return;
    }
    setAppMode('cloud');
  }, [cloudUnlocked, router, setAppMode]);

  const handlePress = useCallback(
    (id: string) => {
      router.push({ pathname: '/(app)/schedules/create' as const, params: { id } });
    },
    [router],
  );

  const handleToggle = useCallback(
    (id: string) => {
      const schedule = schedules.find((item) => item.id === id);
      if (schedule && !schedule.isActive && !canCreateSchedule) {
        router.push('/(app)/settings/cloud-billing' as Parameters<typeof router.push>[0]);
        return;
      }
      toggleSchedule(id);
    },
    [canCreateSchedule, router, schedules, toggleSchedule],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const schedule = schedules.find((s) => s.id === id);
      Alert.alert(
        'Delete Schedule',
        `Are you sure you want to delete "${schedule?.name ?? 'this schedule'}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => deleteSchedule(id),
          },
        ],
      );
    },
    [schedules, deleteSchedule],
  );

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

  if (loading && schedules.length === 0) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
        <Header
          onBackPress={handleBack}
          onCreatePress={canCreateSchedule ? handleCreate : undefined}
        />
        <View className="px-4 gap-3 mt-2">
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              className="rounded-xl p-4"
              style={{ backgroundColor: colors.surfaceOverlay }}
            >
              <Skeleton width="60%" height={18} className="mb-3" />
              <Skeleton width="100%" height={14} className="mb-2" />
              <Skeleton width="45%" height={12} className="mb-2" />
              <View className="flex-row gap-2">
                <Skeleton width={70} height={18} borderRadius={9999} />
                <Skeleton width={60} height={18} borderRadius={9999} />
              </View>
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      {/* Header */}
      <Header
        onBackPress={handleBack}
        onCreatePress={canCreateSchedule ? handleCreate : undefined}
      />

      {/* Quick schedule button */}
      {canCreateSchedule ? (
        <View className="px-4 mb-3">
          <QuickSchedule onCreated={handleRefresh} />
        </View>
      ) : (
        <Pressable
          onPress={handleCreate}
          className="mx-4 mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"
          accessibilityRole="button"
          accessibilityLabel="View plans for scheduled tasks"
        >
          <Text className="text-sm font-medium text-amber-300">Scheduled tasks require Basic</Text>
          <Text className="mt-1 text-xs leading-4 text-white/50">
            Upgrade to run unattended Cloud work. Existing tasks remain visible so you can pause or
            delete them.
          </Text>
        </Pressable>
      )}

      {/* Error banner */}
      {error && (
        <View className="mx-4 mb-3 bg-red-500/10 rounded-lg p-3 flex-row items-center justify-between">
          <Text className="text-sm text-red-400 flex-1">{error}</Text>
          <Pressable onPress={clearError} className="ml-2 p-1">
            <Text className="text-xs text-red-400/70">Dismiss</Text>
          </Pressable>
        </View>
      )}

      {schedules.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}
        >
          {SCHEDULE_FILTERS.map((item) => {
            const selected = item.key === filter;
            const count =
              item.key === 'all'
                ? schedules.length
                : schedules.filter((schedule) => schedule.isActive === (item.key === 'active'))
                    .length;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                accessibilityRole="button"
                accessibilityLabel={`Filter schedules: ${item.label}`}
                accessibilityState={{ selected }}
                style={{
                  height: 34,
                  borderRadius: 17,
                  paddingHorizontal: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  backgroundColor: selected ? colors.teal : colors.surfaceOverlay,
                  borderColor: selected ? colors.teal : colors.border,
                }}
              >
                <Text
                  style={{
                    color: selected ? colors.white : colors.textSecondary,
                    fontSize: 13,
                    fontWeight: '600',
                  }}
                >
                  {`${item.label} (${count})`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Schedule list or empty state */}
      {schedules.length === 0 ? (
        <EmptyState
          onCreatePress={handleCreate}
          onUseTemplate={handleUseTemplate}
          canCreateSchedule={canCreateSchedule}
        />
      ) : visibleSchedules.length === 0 ? (
        <View className="flex-1 items-center px-8 pt-10">
          <Text className="text-center text-sm text-white/50">
            {filter === 'active'
              ? 'No active schedules. Resume one to run it again.'
              : 'No paused schedules.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleSchedules}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
              progressBackgroundColor={colors.surfaceElevated}
            />
          }
          renderItem={({ item, index }) => (
            <ScheduleCard
              schedule={item}
              index={index}
              onPress={handlePress}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          )}
          keyExtractor={(item) => item.id}
        />
      )}

      {/* FAB */}
      {schedules.length > 0 && canCreateSchedule && (
        <Pressable
          onPress={handleCreate}
          className="absolute bottom-6 right-6 w-14 h-14 rounded-full items-center justify-center shadow-lg active:opacity-80"
          style={{ backgroundColor: colors.teal }}
        >
          <Plus size={24} color={colors.white} />
        </Pressable>
      )}
    </SafeAreaView>
  );
}

function Header({
  onBackPress,
  onCreatePress,
}: {
  onBackPress: () => void;
  onCreatePress?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center px-3 h-12">
      <Pressable
        onPress={onBackPress}
        className="p-2 rounded-lg active:bg-white/5"
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <ArrowLeft size={20} color={colors.textSecondary} />
      </Pressable>
      <Text variant="subheading" className="ml-2 flex-1">
        Schedules
      </Text>
      {onCreatePress ? (
        <Pressable
          onPress={onCreatePress}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Create schedule"
        >
          <Plus size={20} color={colors.teal} />
        </Pressable>
      ) : null}
    </View>
  );
}

function EmptyState({
  onCreatePress,
  onUseTemplate,
  canCreateSchedule,
}: {
  onCreatePress: () => void;
  onUseTemplate: (templateId: ScheduleTemplate['id']) => void;
  canCreateSchedule: boolean;
}) {
  const colors = useThemeColors();
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeIn.duration(300)} className="items-center pt-6">
        <View
          className="w-20 h-20 rounded-2xl items-center justify-center mb-5"
          style={{ backgroundColor: `${colors.teal}15` }}
        >
          <Calendar size={36} color={colors.teal} />
        </View>

        <Text variant="heading" className="text-center mb-2">
          {canCreateSchedule ? 'No Schedules' : 'Scheduled tasks require Basic'}
        </Text>
        <Text className="text-white/50 text-center text-sm mb-6 leading-5">
          {canCreateSchedule
            ? 'Create recurring AI tasks that run during the daily AGI Cloud scheduling window.'
            : 'Upgrade to create unattended Cloud tasks. Free Cloud chat remains available.'}
        </Text>

        <Button
          title={canCreateSchedule ? 'Create Schedule' : 'View Plans'}
          variant="primary"
          size="lg"
          onPress={onCreatePress}
          className="w-full"
        />
      </Animated.View>

      {canCreateSchedule ? (
        <Animated.View entering={FadeIn.delay(80).duration(300)} className="mt-8">
          <Text variant="subheading">Try a template</Text>
          <Text className="mb-3 mt-1 text-sm leading-5 text-white/45">
            Pick a starting point, then confirm the prompt, time, and model.
          </Text>
          <View className="gap-3">
            {SCHEDULE_TEMPLATES.map((template) => (
              <TemplateCard key={template.id} template={template} onPress={onUseTemplate} />
            ))}
          </View>
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}

function TemplateCard({
  template,
  onPress,
}: {
  template: ScheduleTemplate;
  onPress: (templateId: ScheduleTemplate['id']) => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={() => onPress(template.id)}
      className="min-h-[76px] flex-row items-center rounded-2xl border border-white/20 bg-white/[0.03] px-4 py-3 active:bg-white/[0.06]"
      style={{ borderStyle: 'dashed' }}
      accessibilityRole="button"
      accessibilityLabel={`Use ${template.title} template`}
      accessibilityHint="Opens a new scheduled task with this template filled in"
    >
      <Text className="mr-3 text-2xl">{template.emoji}</Text>
      <View className="flex-1 pr-3">
        <Text className="font-semibold text-white">{template.title}</Text>
        <Text className="mt-1 text-xs leading-4 text-white/50">{template.description}</Text>
      </View>
      <View
        className="h-8 w-8 items-center justify-center rounded-full"
        style={{ backgroundColor: `${colors.teal}20` }}
      >
        <Plus size={17} color={colors.teal} />
      </View>
    </Pressable>
  );
}
