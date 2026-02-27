import { useState, useCallback, useMemo } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { ChevronDown, Trash2 } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RecurrencePicker } from './RecurrencePicker';
import { colors } from '@/lib/theme';
import type { Schedule, RecurrenceType } from '@/stores/scheduleStore';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScheduleFormProps {
  initialData?: Partial<Schedule>;
  onSubmit: (data: Partial<Schedule>) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduleForm({
  initialData,
  onSubmit,
  onCancel,
  onDelete,
  isLoading = false,
}: ScheduleFormProps) {
  const isEditing = Boolean(initialData?.id);

  // Form state
  const [name, setName] = useState(initialData?.name ?? '');
  const [prompt, setPrompt] = useState(initialData?.prompt ?? '');
  const [model, setModel] = useState(initialData?.model ?? 'auto-balanced');
  const [recurrence, setRecurrence] = useState<RecurrenceType>(
    initialData?.recurrence ?? 'daily',
  );
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    initialData?.daysOfWeek ?? [],
  );
  const [dayOfMonth, setDayOfMonth] = useState(
    initialData?.dayOfMonth ?? 1,
  );
  const [timeOfDay, setTimeOfDay] = useState(
    initialData?.timeOfDay ?? '09:00',
  );
  const [scheduledAt, setScheduledAt] = useState<string | null>(
    initialData?.scheduledAt ?? null,
  );
  const [cronExpression, setCronExpression] = useState(
    initialData?.cronExpression ?? '',
  );
  const [timezone, setTimezone] = useState(
    initialData?.timezone ?? getDeviceTimezone(),
  );

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!prompt.trim()) {
      newErrors.prompt = 'Prompt is required';
    }
    if (recurrence === 'once' && !scheduledAt) {
      newErrors.scheduledAt = 'Date is required for one-time schedules';
    }
    if (recurrence === 'weekly' && daysOfWeek.length === 0) {
      newErrors.daysOfWeek = 'Select at least one day';
    }
    if (recurrence === 'custom' && !cronExpression.trim()) {
      newErrors.cronExpression = 'Cron expression is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, prompt, recurrence, scheduledAt, daysOfWeek, cronExpression]);

  // Handle recurrence picker changes
  const handleRecurrenceChange = useCallback(
    (
      rec: RecurrenceType,
      options?: {
        daysOfWeek?: number[];
        dayOfMonth?: number;
        timeOfDay?: string;
        scheduledAt?: string;
        cronExpression?: string;
      },
    ) => {
      setRecurrence(rec);
      if (options?.daysOfWeek !== undefined) setDaysOfWeek(options.daysOfWeek);
      if (options?.dayOfMonth !== undefined) setDayOfMonth(options.dayOfMonth);
      if (options?.timeOfDay !== undefined) setTimeOfDay(options.timeOfDay);
      if (options?.scheduledAt !== undefined) setScheduledAt(options.scheduledAt);
      if (options?.cronExpression !== undefined)
        setCronExpression(options.cronExpression);
    },
    [],
  );

  // Submit
  const handleSubmit = useCallback(() => {
    if (!validate()) return;

    onSubmit({
      name: name.trim(),
      prompt: prompt.trim(),
      model,
      recurrence,
      daysOfWeek: recurrence === 'weekly' ? daysOfWeek : undefined,
      dayOfMonth: recurrence === 'monthly' ? dayOfMonth : undefined,
      timeOfDay,
      scheduledAt: recurrence === 'once' ? scheduledAt : null,
      cronExpression: recurrence === 'custom' ? cronExpression : undefined,
      timezone,
      isActive: initialData?.isActive ?? true,
    });
  }, [
    validate,
    onSubmit,
    name,
    prompt,
    model,
    recurrence,
    daysOfWeek,
    dayOfMonth,
    timeOfDay,
    scheduledAt,
    cronExpression,
    timezone,
    initialData?.isActive,
  ]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name */}
        <View className="mb-4 mt-4">
          <Input
            label="Schedule Name"
            placeholder="e.g., Daily news summary"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (errors.name) setErrors((e) => ({ ...e, name: '' }));
            }}
            error={errors.name}
            autoCapitalize="sentences"
          />
        </View>

        {/* Prompt */}
        <View className="mb-4">
          <Text className="text-sm text-white/70 mb-1.5">Prompt</Text>
          <View
            className={`rounded-lg bg-surface-elevated border ${
              errors.prompt ? 'border-red-500' : 'border-white/10'
            } p-3`}
          >
            <Input
              placeholder="What should the AI do?"
              value={prompt}
              onChangeText={(text) => {
                setPrompt(text);
                if (errors.prompt) setErrors((e) => ({ ...e, prompt: '' }));
              }}
              multiline
              numberOfLines={4}
              className="min-h-[80px] border-0 bg-transparent p-0"
              textAlignVertical="top"
            />
          </View>
          {errors.prompt ? (
            <Text className="text-xs text-red-400 mt-1">{errors.prompt}</Text>
          ) : null}
        </View>

        {/* Model selector */}
        <View className="mb-4">
          <Text className="text-sm text-white/70 mb-1.5">Model</Text>
          <Pressable
            className="flex-row items-center justify-between h-11 px-3 rounded-lg bg-surface-elevated border border-white/10"
            onPress={() => {
              // TODO: Wire to ModelPickerSheet bottom sheet
            }}
            accessibilityHint="Opens model selection"
          >
            <Text className="text-sm text-white">{model}</Text>
            <ChevronDown size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        <Separator className="my-2" />

        {/* Recurrence picker */}
        <View className="mb-4 mt-2">
          <RecurrencePicker
            value={recurrence}
            daysOfWeek={daysOfWeek}
            dayOfMonth={dayOfMonth}
            timeOfDay={timeOfDay}
            scheduledAt={scheduledAt}
            cronExpression={cronExpression}
            onChange={handleRecurrenceChange}
          />
          {errors.daysOfWeek ? (
            <Text className="text-xs text-red-400 mt-1">
              {errors.daysOfWeek}
            </Text>
          ) : null}
          {errors.scheduledAt ? (
            <Text className="text-xs text-red-400 mt-1">
              {errors.scheduledAt}
            </Text>
          ) : null}
          {errors.cronExpression ? (
            <Text className="text-xs text-red-400 mt-1">
              {errors.cronExpression}
            </Text>
          ) : null}
        </View>

        <Separator className="my-2" />

        {/* Timezone */}
        <View className="mb-6 mt-2">
          <Input
            label="Timezone"
            value={timezone}
            onChangeText={setTimezone}
            placeholder="America/New_York"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Action buttons */}
        <View className="gap-3">
          <Button
            title={isEditing ? 'Save Changes' : 'Create Schedule'}
            variant="primary"
            size="lg"
            onPress={handleSubmit}
            loading={isLoading}
            disabled={isLoading}
            className="w-full"
          />
          <Button
            title="Cancel"
            variant="ghost"
            size="md"
            onPress={onCancel}
            disabled={isLoading}
            className="w-full"
          />

          {/* Delete button for editing */}
          {isEditing && onDelete && (
            <>
              <Separator className="my-2" />
              <Button
                title="Delete Schedule"
                variant="destructive"
                size="md"
                onPress={onDelete}
                disabled={isLoading}
                className="w-full"
              />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
