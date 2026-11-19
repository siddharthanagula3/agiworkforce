import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { HEADER_TEXT_SCALE_LIMIT } from '@/src/features/chat/components/WorkModeSwitch';
import { Button } from '@/components/ui/Button';
import {
  CloudSchedulesGate,
  ScheduleForm,
  getScheduleTemplate,
  scheduleDraftFromPrompt,
  useScheduleStore,
  type CreateScheduleInput,
  type Schedule,
} from '@/src/features/schedules';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { useTierStore } from '@/src/features/billing/store';
import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';
import { getPlanMaxScheduledTasks } from '@agiworkforce/types';
import { useUnsavedChangesGuard } from '@/src/shared/hooks/useUnsavedChangesGuard';
import { confirmScheduleDeletion } from '@/src/features/schedules/deleteConfirmation';

export default function CreateScheduleScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    template?: string;
    prompt?: string;
    model?: string;
    agentId?: string;
    projectId?: string;
  }>();
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
  const fromConversation = useMemo(
    () =>
      params.id || !params.prompt
        ? undefined
        : scheduleDraftFromPrompt(params.prompt, params.model),
    [params.id, params.prompt, params.model],
  );

  const newScheduleData = useMemo(() => {
    const base = fromConversation ?? selectedTemplate?.initialData;
    return params.agentId ? { ...base, agentId: params.agentId } : base;
  }, [fromConversation, params.agentId, selectedTemplate]);

  const isEditing = Boolean(existingSchedule);
  const attemptedScheduleFetch = useRef(false);
  const [formGeneration, setFormGeneration] = useState(0);
  const formKey = [
    params.id,
    params.template,
    params.prompt,
    params.model,
    params.agentId,
    params.projectId,
    formGeneration,
  ].join('|');

  const leaveScreen = useCallback(() => {
    setFormGeneration((generation) => generation + 1);
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/chat' as Parameters<typeof router.replace>[0]);
  }, [router]);

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
        if (NATIVE_PURCHASES_AVAILABLE) {
          router.push('/(app)/settings/cloud-billing' as Parameters<typeof router.push>[0]);
        }
        return;
      }
      try {
        if (isEditing && existingSchedule) {
          await updateSchedule(existingSchedule.id, data);
        } else {
          const created = await createSchedule({
            ...data,
            ...(params.projectId ? { projectId: params.projectId } : {}),
          } as Parameters<typeof createSchedule>[0]);
          if (!created) return;
        }
        leaveScreen();
      } catch {
        // Error is handled in the store and shown via the error banner on the list screen
      }
    },
    [
      canCreateSchedule,
      isEditing,
      existingSchedule,
      createSchedule,
      updateSchedule,
      router,
      leaveScreen,
      params.projectId,
    ],
  );

  const handleActivateCloud = useCallback(() => {
    if (!cloudUnlocked) {
      router.push(beginCloudPostAuthIntent('cloud-schedules'));
      return;
    }
    setAppMode('cloud');
  }, [cloudUnlocked, router, setAppMode]);

  const handleDelete = useCallback(() => {
    if (!existingSchedule) return;

    confirmScheduleDeletion(existingSchedule.name, async () => {
      if (await deleteSchedule(existingSchedule.id)) leaveScreen();
    });
  }, [existingSchedule, deleteSchedule, leaveScreen]);

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
        onBack={leaveScreen}
        onContinue={handleActivateCloud}
      />
    );
  }

  if (!params.id && !canCreateSchedule) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
        <View className="flex-row items-center px-4 min-h-12">
          <PressableBox
            onPress={leaveScreen}
            className="p-2 -ml-2 rounded-lg active:bg-white/5"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={22} color={colors.textSecondary} />
          </PressableBox>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text variant="heading" className="text-center">
            {NATIVE_PURCHASES_AVAILABLE
              ? 'Scheduled tasks require Basic'
              : "Scheduled tasks aren't included in your plan"}
          </Text>
          <Text className="mt-2 text-center text-sm leading-5 text-white/50">
            {NATIVE_PURCHASES_AVAILABLE
              ? 'Upgrade to create unattended tasks in the daily AGI Cloud scheduling window.'
              : 'Free Cloud chat remains available.'}
          </Text>
          {NATIVE_PURCHASES_AVAILABLE ? (
            <Button
              title="View Plans"
              size="lg"
              onPress={() =>
                router.push('/(app)/settings/cloud-billing' as Parameters<typeof router.push>[0])
              }
              className="mt-6 min-w-[220px]"
              accessibilityLabel="View plans for scheduled tasks"
            />
          ) : null}
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
        <View className="flex-row items-center px-4 min-h-12">
          <PressableBox onPress={leaveScreen} className="p-2 -ml-2" accessibilityLabel="Go back">
            <ArrowLeft size={22} color={colors.textSecondary} />
          </PressableBox>
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
            <Button
              title="Try Again"
              onPress={handleRetryLoad}
              className="mt-6 min-w-[180px]"
              accessibilityLabel="Retry loading schedule"
            />
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScheduleEditor
      key={formKey}
      existingSchedule={existingSchedule}
      initialData={existingSchedule ?? newScheduleData}
      onSubmit={handleSubmit}
      onLeave={leaveScreen}
      onDelete={isEditing ? handleDelete : undefined}
      isLoading={loading}
      submitError={error}
    />
  );
}

function ScheduleEditor({
  existingSchedule,
  initialData,
  onSubmit,
  onLeave,
  onDelete,
  isLoading,
  submitError,
}: {
  existingSchedule: Schedule | undefined;
  initialData: Partial<Schedule> | undefined;
  onSubmit: (data: Partial<CreateScheduleInput>) => void;
  onLeave: () => void;
  onDelete: (() => void) | undefined;
  isLoading: boolean;
  submitError: string | null;
}) {
  const colors = useThemeColors();
  const router = useRouter();
  const [formDirty, setFormDirty] = useState(false);
  const guardLeave = useUnsavedChangesGuard(formDirty);
  const handleCancel = useCallback(() => guardLeave(onLeave), [guardLeave, onLeave]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      <View className="flex-row items-center px-4 min-h-12">
        <PressableBox
          onPress={handleCancel}
          className="p-2 -ml-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={22} color={colors.textSecondary} />
        </PressableBox>
        <Text
          variant="subheading"
          className="ml-2 flex-1"
          maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
        >
          {existingSchedule ? 'Edit Schedule' : 'New Schedule'}
        </Text>
        {existingSchedule ? (
          <PressableBox
            onPress={() =>
              router.push({
                pathname: '/(app)/schedules/triggers/[id]' as const,
                params: { id: existingSchedule.id, name: existingSchedule.name },
              })
            }
            className="min-h-[44px] justify-center px-2"
            accessibilityRole="button"
            accessibilityLabel="Event triggers for this schedule"
          >
            <Text className="text-sm font-semibold">Triggers</Text>
          </PressableBox>
        ) : null}
      </View>

      <ScheduleForm
        initialData={initialData}
        onSubmit={onSubmit}
        onCancel={handleCancel}
        onDelete={onDelete}
        isLoading={isLoading}
        submitError={submitError}
        onDirtyChange={setFormDirty}
      />
    </SafeAreaView>
  );
}
