import { useState, useCallback, useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors } from '@/src/ui/theme';
import type { RecurrenceType } from '../store';
import { ScheduleDateTimeField } from './ScheduleDateTimeField';
import {
  MOBILE_SCHEDULE_CADENCE_NOTE,
  MOBILE_SUPPORTED_SCHEDULE_RECURRENCES,
  isMobileScheduleRecurrenceSupported,
  type MobileSupportedScheduleRecurrence,
} from '../policy';

interface RecurrencePickerProps {
  value: RecurrenceType;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  timeOfDay: string;
  scheduledDate?: string | null;
  onChange: (
    recurrence: RecurrenceType,
    options?: {
      daysOfWeek?: number[];
      dayOfMonth?: number;
      timeOfDay?: string;
      scheduledDate?: string;
    },
  ) => void;
}

const RECURRENCE_LABELS: Readonly<Record<MobileSupportedScheduleRecurrence, string>> = {
  once: 'Once',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function isValidIsoDateInput(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

export function RecurrencePicker({
  value,
  daysOfWeek = [],
  dayOfMonth = 1,
  timeOfDay,
  scheduledDate,
  onChange,
}: RecurrencePickerProps) {
  const colors = useThemeColors();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const [localDate, setLocalDate] = useState(scheduledDate ?? '');
  const [dateError, setDateError] = useState<string | undefined>();

  useEffect(() => {
    setLocalDate(scheduledDate ?? '');
    setDateError(undefined);
  }, [scheduledDate]);

  const haptic = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [hapticsEnabled]);

  const handleTypeChange = useCallback(
    (type: RecurrenceType) => {
      haptic();
      onChange(type);
    },
    [haptic, onChange],
  );

  const handleDayToggle = useCallback(
    (day: number) => {
      haptic();
      const current = new Set(daysOfWeek);
      if (current.has(day)) {
        current.delete(day);
      } else {
        current.add(day);
      }
      onChange('weekly', { daysOfWeek: Array.from(current).sort() });
    },
    [haptic, daysOfWeek, onChange],
  );

  const handleDayOfMonthChange = useCallback(
    (day: number) => {
      haptic();
      onChange('monthly', { dayOfMonth: day });
    },
    [haptic, onChange],
  );

  const handleTimeChange = useCallback(
    (time: string) => {
      haptic();
      onChange(value, { timeOfDay: time });
    },
    [haptic, value, onChange],
  );

  const handleDateChange = useCallback(
    (text: string) => {
      setLocalDate(text);
      if (!isValidIsoDateInput(text)) {
        setDateError('Use a valid date in YYYY-MM-DD format.');
        return;
      }
      setDateError(undefined);
      onChange('once', { scheduledDate: text });
    },
    [onChange],
  );

  return (
    <View className="gap-4">
      {/* Recurrence type chips */}
      <View>
        <Text className="text-sm text-white/70 mb-2">Recurrence</Text>
        <View className="flex-row flex-wrap gap-2">
          {MOBILE_SUPPORTED_SCHEDULE_RECURRENCES.map((recurrence) => {
            const selected = value === recurrence;
            return (
              <PressableBox
                key={recurrence}
                onPress={() => handleTypeChange(recurrence)}
                className={`px-4 py-2 rounded-full border ${
                  selected ? '' : 'bg-surface-elevated border-white/10'
                }`}
                style={
                  selected
                    ? { backgroundColor: colors.accentSurface, borderColor: colors.accentBorder }
                    : undefined
                }
                accessibilityLabel={`Recurrence: ${RECURRENCE_LABELS[recurrence]}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text
                  className={`text-xs font-medium ${selected ? '' : 'text-white/60'}`}
                  style={selected ? { color: colors.teal } : undefined}
                >
                  {RECURRENCE_LABELS[recurrence]}
                </Text>
              </PressableBox>
            );
          })}
        </View>
        <Text className="text-xs text-white/40 mt-2 leading-4">{MOBILE_SCHEDULE_CADENCE_NOTE}</Text>
        {!isMobileScheduleRecurrenceSupported(value) ? (
          <Text className="text-xs text-amber-400 mt-2 leading-4">
            This cadence cannot be edited on Mobile. Choose Once, Daily, Weekly, or Monthly before
            saving.
          </Text>
        ) : null}
      </View>

      {/* Weekly: Day circles */}
      {value === 'weekly' && (
        <View>
          <Text className="text-sm text-white/70 mb-2">Days</Text>
          <View className="flex-row gap-2 justify-between">
            {DAY_LABELS.map((label, idx) => {
              const selected = daysOfWeek.includes(idx);
              return (
                <PressableBox
                  key={idx}
                  onPress={() => handleDayToggle(idx)}
                  className={`w-9 h-9 rounded-full items-center justify-center ${
                    selected ? '' : 'bg-surface-elevated'
                  }`}
                  style={selected ? { backgroundColor: colors.teal } : undefined}
                  accessibilityLabel={`${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][idx]}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    className={`text-xs font-semibold ${selected ? '' : 'text-white/50'}`}
                    style={selected ? { color: colors.accentText } : undefined}
                  >
                    {label}
                  </Text>
                </PressableBox>
              );
            })}
          </View>
        </View>
      )}

      {/* Monthly: Day of month picker */}
      {value === 'monthly' && (
        <View>
          <Text className="text-sm text-white/70 mb-2">Day of Month</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}
          >
            {MONTH_DAYS.map((day) => {
              const selected = dayOfMonth === day;
              return (
                <PressableBox
                  key={day}
                  onPress={() => handleDayOfMonthChange(day)}
                  className={`w-9 h-9 rounded-lg items-center justify-center ${
                    selected ? '' : 'bg-surface-elevated'
                  }`}
                  style={selected ? { backgroundColor: colors.teal } : undefined}
                  accessibilityLabel={`Day ${day}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    className={`text-xs font-medium ${selected ? '' : 'text-white/50'}`}
                    style={selected ? { color: colors.accentText } : undefined}
                  >
                    {day}
                  </Text>
                </PressableBox>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Once: Date input */}
      {value === 'once' && (
        <ScheduleDateTimeField
          mode="date"
          label="Date"
          value={localDate}
          onChange={handleDateChange}
          error={dateError}
        />
      )}

      {/* Time picker (HH:MM) */}
      {isMobileScheduleRecurrenceSupported(value) && (
        <ScheduleDateTimeField
          mode="time"
          label="Preferred time"
          value={timeOfDay || '09:00'}
          onChange={handleTimeChange}
        />
      )}
    </View>
  );
}
