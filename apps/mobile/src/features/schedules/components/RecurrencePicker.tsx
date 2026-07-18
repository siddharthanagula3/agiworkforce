import { useState, useCallback, useEffect } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { useSettingsStore } from '@/stores/settingsStore';
import type { RecurrenceType } from '../store';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RecurrencePickerProps {
  value: RecurrenceType;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  timeOfDay: string;
  scheduledAt?: string | null;
  cronExpression?: string;
  intervalMs?: number;
  onChange: (
    recurrence: RecurrenceType,
    options?: {
      daysOfWeek?: number[];
      dayOfMonth?: number;
      timeOfDay?: string;
      scheduledAt?: string;
      cronExpression?: string;
      intervalMs?: number;
    },
  ) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECURRENCE_OPTIONS: { key: RecurrenceType; label: string }[] = [
  { key: 'once', label: 'Once' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'custom', label: 'Custom' },
  { key: 'interval', label: 'Interval' },
];

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));

const MINUTES = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

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

function isValidCronInput(value: string): boolean {
  const parts = value.trim().split(/\s+/);
  return parts.length === 5 && parts.every((part) => /^[0-9*/,-]+$/.test(part));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecurrencePicker({
  value,
  daysOfWeek = [],
  dayOfMonth = 1,
  timeOfDay,
  scheduledAt,
  cronExpression = '',
  intervalMs = 60 * 60 * 1000,
  onChange,
}: RecurrencePickerProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const [localCron, setLocalCron] = useState(cronExpression);
  const [localIntervalMinutes, setLocalIntervalMinutes] = useState(
    String(Math.max(1, Math.round(intervalMs / 60_000))),
  );
  const [localDate, setLocalDate] = useState(scheduledAt ?? '');
  const [dateError, setDateError] = useState<string | undefined>();
  const [cronError, setCronError] = useState<string | undefined>();
  const [intervalError, setIntervalError] = useState<string | undefined>();

  useEffect(() => {
    setLocalDate(scheduledAt ?? '');
    setDateError(undefined);
  }, [scheduledAt]);

  useEffect(() => {
    setLocalCron(cronExpression);
    setCronError(undefined);
  }, [cronExpression]);

  useEffect(() => {
    setLocalIntervalMinutes(String(Math.max(1, Math.round(intervalMs / 60_000))));
    setIntervalError(undefined);
  }, [intervalMs]);

  const timeParts = (timeOfDay || '09:00').split(':');
  const hours = timeParts[0] ?? '09';
  const minutes = timeParts[1] ?? '00';

  const haptic = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [hapticsEnabled]);

  // --- Recurrence type selector ---
  const handleTypeChange = useCallback(
    (type: RecurrenceType) => {
      haptic();
      onChange(type);
    },
    [haptic, onChange],
  );

  // --- Day of week toggle ---
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

  // --- Day of month ---
  const handleDayOfMonthChange = useCallback(
    (day: number) => {
      haptic();
      onChange('monthly', { dayOfMonth: day });
    },
    [haptic, onChange],
  );

  // --- Time picker ---
  const handleHourChange = useCallback(
    (h: string) => {
      haptic();
      onChange(value, { timeOfDay: `${h}:${minutes}` });
    },
    [haptic, value, minutes, onChange],
  );

  const handleMinuteChange = useCallback(
    (m: string) => {
      haptic();
      onChange(value, { timeOfDay: `${hours}:${m}` });
    },
    [haptic, value, hours, onChange],
  );

  // --- Scheduled date for "once" ---
  const handleDateChange = useCallback(
    (text: string) => {
      setLocalDate(text);
      if (!isValidIsoDateInput(text)) {
        setDateError('Use a valid date in YYYY-MM-DD format.');
        return;
      }
      setDateError(undefined);
      onChange('once', { scheduledAt: text });
    },
    [onChange],
  );

  // --- Cron expression ---
  const handleCronChange = useCallback(
    (text: string) => {
      setLocalCron(text);
      if (!isValidCronInput(text)) {
        setCronError('Use a 5-field cron expression with numbers, *, /, - and commas.');
        return;
      }
      setCronError(undefined);
      onChange('custom', { cronExpression: text });
    },
    [onChange],
  );

  const handleIntervalChange = useCallback(
    (text: string) => {
      setLocalIntervalMinutes(text);
      const minutes = Number(text);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 525_600) {
        setIntervalError('Enter a whole number from 1 to 525600 minutes.');
        return;
      }
      setIntervalError(undefined);
      onChange('interval', { intervalMs: minutes * 60_000 });
    },
    [onChange],
  );

  return (
    <View className="gap-4">
      {/* Recurrence type chips */}
      <View>
        <Text className="text-sm text-white/70 mb-2">Recurrence</Text>
        <View className="flex-row flex-wrap gap-2">
          {RECURRENCE_OPTIONS.map((opt) => {
            const selected = value === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => handleTypeChange(opt.key)}
                className={`px-4 py-2 rounded-full border ${
                  selected
                    ? 'bg-teal-500/20 border-teal-500'
                    : 'bg-surface-elevated border-white/10'
                }`}
                accessibilityLabel={`Recurrence: ${opt.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text
                  className={`text-xs font-medium ${selected ? 'text-teal-400' : 'text-white/60'}`}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Weekly: Day circles */}
      {value === 'weekly' && (
        <View>
          <Text className="text-sm text-white/70 mb-2">Days</Text>
          <View className="flex-row gap-2 justify-between">
            {DAY_LABELS.map((label, idx) => {
              const selected = daysOfWeek.includes(idx);
              return (
                <Pressable
                  key={idx}
                  onPress={() => handleDayToggle(idx)}
                  className={`w-9 h-9 rounded-full items-center justify-center ${
                    selected ? 'bg-teal-500' : 'bg-surface-elevated'
                  }`}
                  accessibilityLabel={`${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][idx]}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    className={`text-xs font-semibold ${selected ? 'text-white' : 'text-white/50'}`}
                  >
                    {label}
                  </Text>
                </Pressable>
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
                <Pressable
                  key={day}
                  onPress={() => handleDayOfMonthChange(day)}
                  className={`w-9 h-9 rounded-lg items-center justify-center ${
                    selected ? 'bg-teal-500' : 'bg-surface-elevated'
                  }`}
                  accessibilityLabel={`Day ${day}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    className={`text-xs font-medium ${selected ? 'text-white' : 'text-white/50'}`}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Once: Date input */}
      {value === 'once' && (
        <Input
          label="Date (YYYY-MM-DD)"
          placeholder="2026-03-01"
          value={localDate}
          onChangeText={handleDateChange}
          error={dateError}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />
      )}

      {/* Custom: Cron expression */}
      {value === 'custom' && (
        <Input
          label="Cron Expression"
          placeholder="0 9 * * 1-5"
          value={localCron}
          onChangeText={handleCronChange}
          error={cronError}
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}

      {/* Interval: repeat delay */}
      {value === 'interval' && (
        <Input
          label="Repeat every (minutes)"
          placeholder="60"
          value={localIntervalMinutes}
          onChangeText={handleIntervalChange}
          error={intervalError}
          keyboardType="number-pad"
        />
      )}

      {/* Time picker (HH:MM) */}
      {value !== 'interval' && (
        <View>
          <Text className="text-sm text-white/70 mb-2">Time</Text>
          <View className="flex-row items-center gap-3">
            {/* Hours */}
            <View className="flex-1">
              <Text className="text-[10px] text-white/40 mb-1 text-center uppercase tracking-wider">
                Hour
              </Text>
              <ScrollView
                className="h-32 rounded-lg bg-surface-elevated"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 4 }}
              >
                {HOURS.map((h) => {
                  const selected = h === hours;
                  return (
                    <Pressable
                      key={h}
                      onPress={() => handleHourChange(h)}
                      className={`h-9 items-center justify-center rounded-md mx-1 ${
                        selected ? 'bg-teal-500/20' : ''
                      }`}
                      accessibilityLabel={`${h} hours`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        className={`text-sm font-medium ${
                          selected ? 'text-teal-400' : 'text-white/50'
                        }`}
                      >
                        {h}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <Text className="text-xl text-white/30 font-bold mt-4">:</Text>

            {/* Minutes */}
            <View className="flex-1">
              <Text className="text-[10px] text-white/40 mb-1 text-center uppercase tracking-wider">
                Minute
              </Text>
              <ScrollView
                className="h-32 rounded-lg bg-surface-elevated"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 4 }}
              >
                {MINUTES.map((m) => {
                  const selected = m === minutes;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => handleMinuteChange(m)}
                      className={`h-9 items-center justify-center rounded-md mx-1 ${
                        selected ? 'bg-teal-500/20' : ''
                      }`}
                      accessibilityLabel={`${m} minutes`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        className={`text-sm font-medium ${
                          selected ? 'text-teal-400' : 'text-white/50'
                        }`}
                      >
                        {m}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
