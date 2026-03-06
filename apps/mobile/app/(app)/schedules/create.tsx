import { useCallback, useMemo } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { ScheduleForm } from '@/components/schedules/ScheduleForm';
import { useScheduleStore } from '@/stores/scheduleStore';
import type { Schedule } from '@/stores/scheduleStore';
import { colors } from '@/lib/theme';

export default function CreateScheduleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  const { schedules, loading, createSchedule, updateSchedule, deleteSchedule } = useScheduleStore();

  // Determine if editing
  const existingSchedule = useMemo(
    () => (params.id ? schedules.find((s) => s.id === params.id) : undefined),
    [params.id, schedules],
  );

  const isEditing = Boolean(existingSchedule);

  const handleSubmit = useCallback(
    async (data: Partial<Schedule>) => {
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
    [isEditing, existingSchedule, createSchedule, updateSchedule, router],
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

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

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
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
        initialData={existingSchedule}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        onDelete={isEditing ? handleDelete : undefined}
        isLoading={loading}
      />
    </SafeAreaView>
  );
}
