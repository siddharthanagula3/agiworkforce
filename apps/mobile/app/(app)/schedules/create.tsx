import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import {
  CloudSchedulesGate,
  ScheduleForm,
  getScheduleTemplate,
  useScheduleStore,
  type CreateScheduleInput,
} from '@/src/features/schedules';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';
import { getPlanMaxScheduledTasks } from '@agiworkforce/types';

export default function CreateScheduleScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; template?: string }>();
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const tier = useTierStore((s) => s.tier);
  const scheduledTaskLimit = getPlanMaxScheduledTasks(tier);
  const canCreateSchedule = scheduledTaskLimit === null || scheduledTaskLimit > 0;

  const {
    schedules,
    loading,
    error,
    fetchSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    clearError,
  } = useScheduleStore();

  const existingSchedule = useMemo(
    () => (params.id ? schedules.find((s) => s.id === params.id) : undefined),
    [params.id, schedules],
  );
  const selectedTemplate = useMemo(
    () => (params.id ? undefined : getScheduleTemplate(params.template)),
    [params.id, params.template],
  );

  const isEditing = Boolean(existingSchedule);
  const attemptedScheduleFetch = useRef(false);

  useEffect(() => {
    clearError();
  }, [clearError]);

  useEffect(() => {
    if (
      params.id &&
      appMode === 'cloud' &&
      cloudUnlocked &&
      !existingSchedule &&
      !attemptedScheduleFetch.current
    ) {
      attemptedScheduleFetch.current = true;
      void fetchSchedules();
    }
  }, [appMode, cloudUnlocked, existingSchedule, fetchSchedules, params.id]);

  const handleSubmit = useCallback(
    async (data: Partial<CreateScheduleInput>) => {
      if (!isEditing && !canCreateSchedule) {
        router.push('/(app)/settings/cloud-billing' as Parameters<typeof router.push>[0]);
        return;
      }
      try {
        if (isEditing && existingSchedule) {
          await updateSchedule(existingSchedule.id, data);
        } else {
          await createSchedule(data as Parameters<typeof createSchedule>[0]);
        }
        router.back();
      } catch {
        // Error is handled in the store and shown via the error banner on the list screen
      }
    },
    [canCreateSchedule, isEditing, existingSchedule, createSchedule, updateSchedule, router],
  );

  const handleCancel = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/chat' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleActivateCloud = useCallback(() => {
    if (!cloudUnlocked) {
      router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
      return;
    }
    setAppMode('cloud');
  }, [cloudUnlocked, router, setAppMode]);

  const handleDelete = useCallback(() => {
    if (!existingSchedule) return;

    Alert.alert(
      'Delete Schedule',
      `Are you sure you want to delete "${existingSchedule.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteSchedule(existingSchedule.id);
            router.back();
          },
        },
      ],
    );
  }, [existingSchedule, deleteSchedule, router]);

  const handleRetryLoad = useCallback(() => {
    attemptedScheduleFetch.current = true;
    clearError();
    void fetchSchedules();
  }, [clearError, fetchSchedules]);

  if (!FEATURES.schedules) return <FeatureUnavailable feature="Scheduled tasks" />;
  if (appMode !== 'cloud' || !cloudUnlocked) {
    return (
      <CloudSchedulesGate
        signedIn={cloudUnlocked}
        onBack={handleCancel}
        onContinue={handleActivateCloud}
      />
    );
  }

  if (!params.id && !canCreateSchedule) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
        <View className="flex-row items-center px-4 h-12">
          <Pressable
            onPress={handleCancel}
            className="p-2 -ml-2 rounded-lg active:bg-white/5"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text variant="heading" className="text-center">
            Scheduled tasks require Basic
          </Text>
          <Text className="mt-2 text-center text-sm leading-5 text-white/50">
            Upgrade to create unattended tasks in the daily AGI Cloud scheduling window.
          </Text>
          <Pressable
            onPress={() =>
              router.push('/(app)/settings/cloud-billing' as Parameters<typeof router.push>[0])
            }
            className="mt-6 min-h-[52px] min-w-[220px] items-center justify-center rounded-2xl bg-white"
            accessibilityRole="button"
            accessibilityLabel="View plans for scheduled tasks"
          >
            <Text className="font-semibold text-black">View Plans</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (params.id && !existingSchedule && (!attemptedScheduleFetch.current || loading)) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.surfaceBase }}
      >
        <Text className="text-sm text-white/50">Loading schedule…</Text>
      </SafeAreaView>
    );
  }

  if (params.id && !existingSchedule && !loading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
        <View className="flex-row items-center px-4 h-12">
          <Pressable onPress={handleCancel} className="p-2 -ml-2" accessibilityLabel="Go back">
            <ArrowLeft size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text variant="heading" className="text-center">
            {error ? 'Schedule could not be loaded' : 'Schedule not found'}
          </Text>
          <Text className="mt-2 text-center text-sm leading-5 text-white/50">
            {error
              ? 'The schedule could not be loaded. Check your connection and try again.'
              : 'It may have been deleted, or this account may not have access to it.'}
          </Text>
          {error ? (
            <Pressable
              onPress={handleRetryLoad}
              className="mt-6 min-h-[48px] min-w-[180px] items-center justify-center rounded-xl bg-white"
              accessibilityRole="button"
              accessibilityLabel="Retry loading schedule"
            >
              <Text className="font-semibold text-black">Try Again</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      {/* Header */}
      <View className="flex-row items-center px-4 h-12">
        <Pressable
          onPress={handleCancel}
          className="p-2 -ml-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={22} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2">
          {isEditing ? 'Edit Schedule' : 'New Schedule'}
        </Text>
      </View>

      {/* Form */}
      <ScheduleForm
        initialData={existingSchedule ?? selectedTemplate?.initialData}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        onDelete={isEditing ? handleDelete : undefined}
        isLoading={loading}
        submitError={error}
      />
    </SafeAreaView>
  );
}
