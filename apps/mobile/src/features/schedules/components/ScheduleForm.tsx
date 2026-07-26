import { useState, useCallback, useRef } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RecurrencePicker } from './RecurrencePicker';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import { getDisplayName } from '@/src/features/model-picker/service';
import { colors } from '@/src/ui/theme';
import type { CreateScheduleInput, Schedule, RecurrenceType } from '../store';
import { isMobileScheduleRecurrenceSupported } from '../policy';
import { isoToZonedDateInput, zonedDateAndTimeToIso } from '../timing';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScheduleFormProps {
  initialData?: Partial<Schedule>;
  onSubmit: (data: Partial<CreateScheduleInput>) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isLoading?: boolean;
  submitError?: string | null;
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
  submitError,
}: ScheduleFormProps) {
  const isEditing = Boolean(initialData?.id);
  const initialTimezone = initialData?.timezone ?? getDeviceTimezone();

  // Form state
  const [name, setName] = useState(initialData?.name ?? '');
  const [prompt, setPrompt] = useState(initialData?.prompt ?? '');
  const [model, setModel] = useState(initialData?.model ?? 'auto');
  const modelPickerRef = useRef<BottomSheet>(null);
  const [recurrence, setRecurrence] = useState<RecurrenceType>(initialData?.recurrence ?? 'daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initialData?.daysOfWeek ?? []);
  const [dayOfMonth, setDayOfMonth] = useState(initialData?.dayOfMonth ?? 1);
  const [timeOfDay, setTimeOfDay] = useState(initialData?.timeOfDay ?? '09:00');
  const [scheduledDate, setScheduledDate] = useState(
    isoToZonedDateInput(initialData?.scheduledAt, initialTimezone),
  );
  const [timezone, setTimezone] = useState(initialTimezone);

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = useCallback((): {
    valid: boolean;
    oneTimeInstant: string | null;
  } => {
    const newErrors: Record<string, string> = {};
    let oneTimeInstant: string | null = null;

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!prompt.trim()) {
      newErrors.prompt = 'Prompt is required';
    }
    if (!isMobileScheduleRecurrenceSupported(recurrence)) {
      newErrors.recurrence = 'Choose Once, Daily, Weekly, or Monthly';
    }
    if (recurrence === 'once') {
      if (!scheduledDate) {
        newErrors.scheduledAt = 'Date is required for one-time schedules';
      } else {
        try {
          oneTimeInstant = zonedDateAndTimeToIso(scheduledDate, timeOfDay, timezone);
          if (new Date(oneTimeInstant).getTime() <= Date.now()) {
            newErrors.scheduledAt = 'Choose a date and time in the future';
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Enter a valid date and time';
          if (message.includes('timezone')) newErrors.timezone = message;
          else newErrors.scheduledAt = message;
        }
      }
    } else {
      try {
        // Validate timezone even when no one-time instant needs conversion.
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
      } catch {
        newErrors.timezone = 'Enter a valid IANA timezone, such as America/Chicago.';
      }
    }
    if (recurrence === 'weekly' && daysOfWeek.length === 0) {
      newErrors.daysOfWeek = 'Select at least one day';
    }

    setErrors(newErrors);
    return { valid: Object.keys(newErrors).length === 0, oneTimeInstant };
  }, [name, prompt, recurrence, scheduledDate, timeOfDay, timezone, daysOfWeek]);

  // Handle recurrence picker changes
  const handleRecurrenceChange = useCallback(
    (
      rec: RecurrenceType,
      options?: {
        daysOfWeek?: number[];
        dayOfMonth?: number;
        timeOfDay?: string;
        scheduledDate?: string;
      },
    ) => {
      setRecurrence(rec);
      if (options?.daysOfWeek !== undefined) setDaysOfWeek(options.daysOfWeek);
      if (options?.dayOfMonth !== undefined) setDayOfMonth(options.dayOfMonth);
      if (options?.timeOfDay !== undefined) setTimeOfDay(options.timeOfDay);
      if (options?.scheduledDate !== undefined) setScheduledDate(options.scheduledDate);
    },
    [],
  );

  // Submit
  const handleSubmit = useCallback(() => {
    const validation = validate();
    if (!validation.valid) return;

    onSubmit({
      name: name.trim(),
      prompt: prompt.trim(),
      model,
      recurrence,
      daysOfWeek: recurrence === 'weekly' ? daysOfWeek : undefined,
      dayOfMonth: recurrence === 'monthly' ? dayOfMonth : undefined,
      timeOfDay,
      scheduledAt: recurrence === 'once' ? validation.oneTimeInstant : null,
      cronExpression: undefined,
      intervalMs: undefined,
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
            onPress={() => modelPickerRef.current?.snapToIndex(0)}
            accessibilityLabel={`Model: ${getDisplayName(model)}`}
            accessibilityRole="button"
            accessibilityHint="Opens model selection"
          >
            <Text className="text-sm text-white">{getDisplayName(model)}</Text>
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
            scheduledDate={scheduledDate}
            onChange={handleRecurrenceChange}
          />
          {errors.recurrence ? (
            <Text className="text-xs text-red-400 mt-1">{errors.recurrence}</Text>
          ) : null}
          {errors.daysOfWeek ? (
            <Text className="text-xs text-red-400 mt-1">{errors.daysOfWeek}</Text>
          ) : null}
          {errors.scheduledAt ? (
            <Text className="text-xs text-red-400 mt-1">{errors.scheduledAt}</Text>
          ) : null}
        </View>

        <Separator className="my-2" />

        {/* Timezone */}
        <View className="mb-6 mt-2">
          <Input
            label="Timezone"
            value={timezone}
            onChangeText={(text) => {
              setTimezone(text);
              if (errors.timezone) setErrors((current) => ({ ...current, timezone: '' }));
            }}
            placeholder="America/New_York"
            autoCapitalize="none"
            autoCorrect={false}
            error={errors.timezone}
          />
        </View>

        {submitError ? (
          <View className="mb-4 rounded-lg bg-red-500/10 p-3">
            <Text className="text-sm text-red-400">{submitError}</Text>
          </View>
        ) : null}

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

      {/* Model picker bottom sheet */}
      <ModelPickerSheet sheetRef={modelPickerRef} modelScope="cloud" onSelect={setModel} />
    </KeyboardAvoidingView>
  );
}
