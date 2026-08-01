/**
 * Notification Preferences Screen
 *
 * Per-category toggles, quiet hours, and vibration settings for push
 * notifications delivered by the companion bridge.
 */
import { useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Bell,
  BellOff,
  CheckSquare,
  AlertTriangle,
  AlertOctagon,
  ChevronRight,
  Info,
  Moon,
  Clock,
  Vibrate,
  X,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  useNotificationPrefsStore,
  type NotificationCategory,
} from '@/stores/notificationPrefsStore';
import { useThemeColors } from '@/src/ui/theme';
import type { ColorScheme } from '@/src/ui/theme';
import type { LucideIcon } from 'lucide-react-native';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_COPY } from './categories';
import { useTimeFocusSync } from './useTimeFocusSync';
import { BREAK_REMINDER_MINUTES, type TimeFocusWeekday } from '@agiworkforce/types';

/** Same order and labels as the web Time & Focus day picker. */
const QUIET_HOURS_DAYS: ReadonlyArray<{ value: TimeFocusWeekday; label: string; short: string }> = [
  { value: 0, label: 'Sunday', short: 'S' },
  { value: 1, label: 'Monday', short: 'M' },
  { value: 2, label: 'Tuesday', short: 'T' },
  { value: 3, label: 'Wednesday', short: 'W' },
  { value: 4, label: 'Thursday', short: 'T' },
  { value: 5, label: 'Friday', short: 'F' },
  { value: 6, label: 'Saturday', short: 'S' },
];

function breakReminderLabel(minutes: number | null): string {
  if (minutes === null) return 'Off';
  return minutes < 60 ? `Every ${minutes} min` : `Every ${minutes / 60} hr`;
}

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

interface CategoryMeta {
  id: NotificationCategory;
  label: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
}

function getCategories(c: ColorScheme): CategoryMeta[] {
  const presentation: Record<NotificationCategory, Pick<CategoryMeta, 'icon' | 'iconColor'>> = {
    approvals: {
      icon: CheckSquare,
      iconColor: c.agentWarning,
    },
    task_updates: {
      icon: Info,
      iconColor: c.teal,
    },
    errors: {
      icon: AlertOctagon,
      iconColor: c.agentError,
    },
    status: {
      icon: AlertTriangle,
      iconColor: c.textMuted,
    },
  };
  return NOTIFICATION_CATEGORIES.map((id) => ({
    id,
    ...NOTIFICATION_CATEGORY_COPY[id],
    ...presentation[id],
  }));
}

// ---------------------------------------------------------------------------
// Priority row
// ---------------------------------------------------------------------------

interface PriorityRowProps {
  label: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  color: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}

function PriorityVibrationRow({ label, color, value, onValueChange }: PriorityRowProps) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center justify-between py-2.5 px-1">
      <View className="flex-row items-center gap-3">
        <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
        <Text className="text-sm" style={{ color: colors.textPrimary }}>
          {label}
        </Text>
      </View>
      <Switch
        accessibilityLabel={`${label} vibration`}
        value={value}
        onValueChange={onValueChange}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Quiet hours picker modal
// ---------------------------------------------------------------------------

interface TimePickerModalProps {
  visible: boolean;
  field: 'start' | 'end';
  currentValue: string;
  onClose: () => void;
  onConfirm: (time: string) => void;
}

function TimePickerModal({
  visible,
  field,
  currentValue,
  onClose,
  onConfirm,
}: TimePickerModalProps) {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const [value, setValue] = useState(currentValue);
  const modalWidth = Math.min(width - 48, 320);

  const handleConfirm = useCallback(() => {
    // Validate HH:MM format
    const parts = value.split(':');
    const hours = parseInt(parts[0] ?? '', 10);
    const minutes = parseInt(parts[1] ?? '', 10);
    if (
      parts.length === 2 &&
      !isNaN(hours) &&
      !isNaN(minutes) &&
      hours >= 0 &&
      hours <= 23 &&
      minutes >= 0 &&
      minutes <= 59
    ) {
      // Normalise to 2-digit format
      const normalised = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      onConfirm(normalised);
      onClose();
    }
  }, [value, onConfirm, onClose]);

  // Quick-select common times
  const QUICK_TIMES =
    field === 'start' ? ['21:00', '22:00', '23:00'] : ['06:00', '07:00', '08:00', '09:00'];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessible={false}
        className="flex-1 justify-center items-center"
        style={{ backgroundColor: colors.scrim }}
        onPress={onClose}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable accessible={false} onPress={(e) => e.stopPropagation()}>
            <View
              accessibilityViewIsModal
              className="rounded-2xl p-5"
              style={{
                backgroundColor: colors.surfaceOverlay,
                paddingBottom: 20,
                width: modalWidth,
              }}
            >
              {/* Header */}
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-[15px] font-semibold" style={{ color: colors.textPrimary }}>
                  {field === 'start' ? 'Quiet Hours Start' : 'Quiet Hours End'}
                </Text>
                <Pressable
                  onPress={onClose}
                  className="w-7 h-7 rounded-full items-center justify-center"
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                  })}
                  accessibilityLabel="Close time picker"
                  accessibilityRole="button"
                >
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              </View>

              {/* Text input: 24h HH:MM */}
              <View
                className="rounded-xl px-4 py-3 mb-4 flex-row items-center"
                style={{ backgroundColor: colors.surfaceElevated }}
              >
                <Clock size={16} color={colors.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                  accessibilityLabel={
                    field === 'start' ? 'Quiet hours start time' : 'Quiet hours end time'
                  }
                  value={value}
                  onChangeText={setValue}
                  placeholder="HH:MM"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  style={{
                    flex: 1,
                    color: colors.textPrimary,
                    fontSize: 18,
                    fontVariant: ['tabular-nums'],
                  }}
                  selectTextOnFocus
                />
              </View>

              {/* Quick times */}
              <View className="flex-row flex-wrap gap-2 mb-4">
                {QUICK_TIMES.map((t) => (
                  <Pressable
                    accessibilityLabel={`Set time to ${t}`}
                    accessibilityRole="button"
                    key={t}
                    onPress={() => setValue(t)}
                    className="px-3 py-1.5 rounded-lg active:opacity-70"
                    style={{
                      backgroundColor: value === t ? colors.accentSurface : colors.surfaceElevated,
                      borderWidth: value === t ? 1 : 0,
                      borderColor: colors.accentBorder,
                    }}
                  >
                    <Text
                      className="text-sm"
                      style={{ color: value === t ? colors.teal : colors.textSecondary }}
                    >
                      {t}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Actions */}
              <View style={{ marginTop: 8 }}>
                <Pressable
                  accessibilityLabel="Set Time"
                  accessibilityRole="button"
                  onPress={handleConfirm}
                  style={{
                    alignItems: 'center',
                    backgroundColor: colors.textPrimary,
                    borderColor: colors.textPrimary,
                    borderRadius: 10,
                    borderWidth: 1,
                    justifyContent: 'center',
                    minHeight: 44,
                    width: '100%',
                  }}
                >
                  <Text style={{ color: colors.surfaceElevated, fontSize: 14, fontWeight: '600' }}>
                    Set Time
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Cancel"
                  accessibilityRole="button"
                  onPress={onClose}
                  style={{
                    alignItems: 'center',
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                    borderRadius: 10,
                    borderWidth: 1,
                    justifyContent: 'center',
                    marginTop: 8,
                    minHeight: 44,
                    width: '100%',
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
                    Cancel
                  </Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function NotificationPreferencesScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const {
    categoryEnabled,
    vibrationEnabled,
    quietHours,
    breakReminderMinutes,
    setVibrationEnabled,
    setQuietHours,
    setBreakReminderMinutes,
  } = useNotificationPrefsStore();
  const CATEGORIES = getCategories(colors);
  const timeFocusSync = useTimeFocusSync();
  const pushTimeFocus = timeFocusSync.push;

  const [timePickerField, setTimePickerField] = useState<'start' | 'end' | null>(null);

  const updateQuietHours = useCallback(
    (updates: Parameters<typeof setQuietHours>[0]) => {
      setQuietHours(updates);
      pushTimeFocus();
    },
    [pushTimeFocus, setQuietHours],
  );

  const toggleQuietHoursDay = useCallback(
    (day: TimeFocusWeekday) => {
      const next = quietHours.days.includes(day)
        ? quietHours.days.filter((value) => value !== day)
        : [...quietHours.days, day].sort((a, b) => a - b);
      updateQuietHours({ days: next });
    },
    [quietHours.days, updateQuietHours],
  );

  const cycleBreakReminder = useCallback(() => {
    // Off → 30m → 1h → 2h → 4h → Off, matching the web option set.
    const options: Array<(typeof BREAK_REMINDER_MINUTES)[number] | null> = [
      null,
      ...BREAK_REMINDER_MINUTES,
    ];
    const index = options.indexOf(breakReminderMinutes);
    const next = options[(index + 1) % options.length] ?? null;
    setBreakReminderMinutes(next);
    pushTimeFocus();
  }, [breakReminderMinutes, pushTimeFocus, setBreakReminderMinutes]);

  const handleBack = useCallback(() => {
    router.navigate('/(app)/(tabs)/settings' as Parameters<typeof router.navigate>[0]);
  }, [router]);

  const handleOpenTimePicker = useCallback((field: 'start' | 'end') => {
    setTimePickerField(field);
  }, []);

  const handleTimeConfirm = useCallback(
    (time: string) => {
      if (timePickerField === 'start') {
        updateQuietHours({ startTime: time });
      } else if (timePickerField === 'end') {
        updateQuietHours({ endTime: time });
      }
    },
    [timePickerField, updateQuietHours],
  );

  const priorityRows: Array<{
    key: 'critical' | 'high' | 'normal' | 'low';
    label: string;
    color: string;
  }> = [
    { key: 'critical', label: 'Critical', color: colors.agentError },
    { key: 'high', label: 'High', color: colors.agentWarning },
    { key: 'normal', label: 'Normal', color: colors.teal },
    { key: 'low', label: 'Low', color: colors.textMuted },
  ];

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      {/* Header */}
      <View
        className="flex-row items-center px-3 h-12"
        style={{ backgroundColor: colors.surfaceBase }}
      >
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg"
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
          })}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2 flex-1" style={{ color: colors.textPrimary }}>
          Notification Preferences
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Categories */}
        <View className="mt-3 mb-2">
          <Text
            className="text-[11px] uppercase mb-3"
            style={{ color: colors.textMuted, letterSpacing: 0 }}
          >
            Notification Types
          </Text>
        </View>
        <Card>
          {CATEGORIES.map((cat, idx) => {
            const Icon = cat.icon;
            return (
              <View key={cat.id}>
                {idx > 0 && <Separator />}
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/settings/notifications/[category]',
                      params: { category: cat.id },
                    } as unknown as Parameters<typeof router.push>[0])
                  }
                  accessibilityLabel={`${cat.label}. ${categoryEnabled[cat.id] ? 'Push' : 'Off'}`}
                  accessibilityRole="button"
                  className="flex-row items-center justify-between py-3 px-1 rounded-lg"
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                  })}
                >
                  <View className="flex-row items-center gap-3 flex-1 mr-3">
                    <Icon size={18} color={cat.iconColor} />
                    <View className="flex-1">
                      <Text className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                        {cat.label}
                      </Text>
                      <Text className="text-[11px] mt-0.5" style={{ color: colors.textMuted }}>
                        {cat.description}
                      </Text>
                    </View>
                  </View>
                  <Text
                    className="text-xs font-medium mr-1"
                    style={{ color: colors.textSecondary }}
                  >
                    {categoryEnabled[cat.id] ? 'Push' : 'Off'}
                  </Text>
                  <ChevronRight size={17} color={colors.textMuted} />
                </Pressable>
              </View>
            );
          })}
        </Card>

        {/* Quiet hours */}
        <View className="mt-6 mb-2">
          <Text
            className="text-[11px] uppercase mb-3"
            style={{ color: colors.textMuted, letterSpacing: 0 }}
          >
            Quiet Hours
          </Text>
        </View>
        <Card>
          {/* Master toggle */}
          <View className="flex-row items-center justify-between py-3 px-1">
            <View className="flex-row items-center gap-3">
              <Moon size={18} color={colors.textSecondary} />
              <View>
                <Text className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                  Enable Quiet Hours
                </Text>
                <Text className="text-[11px] mt-0.5" style={{ color: colors.textMuted }}>
                  Suppress non-critical alerts
                </Text>
              </View>
            </View>
            <Switch
              accessibilityLabel="Enable Quiet Hours"
              value={quietHours.enabled}
              onValueChange={(v) => updateQuietHours({ enabled: v })}
            />
          </View>

          {quietHours.enabled && (
            <>
              <Separator />
              {/* Days — quiet hours apply only on the days selected here, the
                  same set web has always offered. */}
              <View className="py-3 px-1">
                <Text className="text-sm mb-2" style={{ color: colors.textPrimary }}>
                  Days
                </Text>
                <View className="flex-row" style={{ gap: 6 }}>
                  {QUIET_HOURS_DAYS.map((day) => {
                    const selected = quietHours.days.includes(day.value);
                    return (
                      <Pressable
                        key={day.value}
                        onPress={() => toggleQuietHoursDay(day.value)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={`${day.label} quiet hours`}
                        style={({ pressed }) => ({
                          flex: 1,
                          height: 36,
                          borderRadius: 10,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: selected ? colors.teal : colors.border,
                          backgroundColor: selected
                            ? colors.teal
                            : pressed
                              ? colors.surfaceHover
                              : colors.transparent,
                        })}
                      >
                        <Text
                          className="text-[13px] font-semibold"
                          style={{ color: selected ? colors.accentText : colors.textSecondary }}
                        >
                          {day.short}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {quietHours.days.length === 0 && (
                  <Text className="text-[11px] mt-2" style={{ color: colors.agentWarning }}>
                    Pick at least one day, or quiet hours stay off.
                  </Text>
                )}
              </View>
              <Separator />
              {/* Start time */}
              <Pressable
                onPress={() => handleOpenTimePicker('start')}
                className="flex-row items-center justify-between py-3 px-1 rounded-lg"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                })}
                accessibilityLabel="Set quiet hours start time"
                accessibilityRole="button"
              >
                <View className="flex-row items-center gap-3">
                  <BellOff size={18} color={colors.textSecondary} />
                  <Text className="text-sm" style={{ color: colors.textPrimary }}>
                    Start Time
                  </Text>
                </View>
                <View
                  className="px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: colors.accentSurface }}
                >
                  <Text className="text-sm font-medium" style={{ color: colors.teal }}>
                    {quietHours.startTime}
                  </Text>
                </View>
              </Pressable>
              <Separator />
              {/* End time */}
              <Pressable
                onPress={() => handleOpenTimePicker('end')}
                className="flex-row items-center justify-between py-3 px-1 rounded-lg"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                })}
                accessibilityLabel="Set quiet hours end time"
                accessibilityRole="button"
              >
                <View className="flex-row items-center gap-3">
                  <Bell size={18} color={colors.textSecondary} />
                  <Text className="text-sm" style={{ color: colors.textPrimary }}>
                    End Time
                  </Text>
                </View>
                <View
                  className="px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: colors.accentSurface }}
                >
                  <Text className="text-sm font-medium" style={{ color: colors.teal }}>
                    {quietHours.endTime}
                  </Text>
                </View>
              </Pressable>

              <View
                className="mt-3 mx-1 px-3 py-2 rounded-lg"
                style={{
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                  borderWidth: 1,
                }}
              >
                <Text className="text-[11px] leading-4" style={{ color: colors.textMuted }}>
                  Critical notifications (agent failures, emergency stops, approval requests) always
                  bypass quiet hours.
                </Text>
              </View>
            </>
          )}

          <Separator />
          {/* Break reminders share the account's time-and-focus settings with
              web, so the cadence chosen on either surface applies to both. */}
          <Pressable
            onPress={cycleBreakReminder}
            className="flex-row items-center justify-between py-3 px-1 rounded-lg"
            style={({ pressed }) => ({
              backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
            })}
            accessibilityRole="button"
            accessibilityLabel={`Break reminder, currently ${breakReminderLabel(breakReminderMinutes)}`}
          >
            <View className="flex-row items-center gap-3">
              <Clock size={18} color={colors.textSecondary} />
              <View>
                <Text className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                  Break Reminder
                </Text>
                <Text className="text-[11px] mt-0.5" style={{ color: colors.textMuted }}>
                  Nudge to step away during long sessions
                </Text>
              </View>
            </View>
            <View
              className="px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: colors.accentSurface }}
            >
              <Text className="text-sm font-medium" style={{ color: colors.teal }}>
                {breakReminderLabel(breakReminderMinutes)}
              </Text>
            </View>
          </Pressable>
        </Card>

        {/* Where these settings live. Quiet hours and break reminders are an
            account setting on web; in Local Mode there is no account to sync
            with, so they stay on this device only. */}
        <Text className="text-[11px] mt-2 px-1" style={{ color: colors.textMuted }}>
          {timeFocusSync.status === 'local'
            ? 'Saved on this device. Switch to AGI Cloud to share quiet hours with web and desktop.'
            : timeFocusSync.status === 'loading'
              ? 'Loading your account settings…'
              : timeFocusSync.status === 'saving'
                ? 'Saving to your account…'
                : timeFocusSync.status === 'error'
                  ? (timeFocusSync.error ?? 'Could not reach your account settings.')
                  : 'Synced with your account — the same schedule applies on web and desktop.'}
        </Text>

        {/* Vibration */}
        <View className="mt-6 mb-2">
          <Text
            className="text-[11px] uppercase mb-3"
            style={{ color: colors.textMuted, letterSpacing: 0 }}
          >
            Vibration
          </Text>
        </View>
        <Card>
          <View className="flex-row items-center gap-3 mb-3 px-1">
            <Vibrate size={18} color={colors.textSecondary} />
            <Text className="text-sm" style={{ color: colors.textSecondary }}>
              Vibrate per priority level
            </Text>
          </View>
          {priorityRows.map((row, idx) => (
            <View key={row.key}>
              {idx > 0 && <Separator />}
              <PriorityVibrationRow
                label={row.label}
                priority={row.key}
                color={row.color}
                value={vibrationEnabled[row.key]}
                onValueChange={(v) => setVibrationEnabled(row.key, v)}
              />
            </View>
          ))}
        </Card>
      </ScrollView>

      {/* Time picker modals */}
      {timePickerField && (
        <TimePickerModal
          visible={timePickerField !== null}
          field={timePickerField}
          currentValue={timePickerField === 'start' ? quietHours.startTime : quietHours.endTime}
          onClose={() => setTimePickerField(null)}
          onConfirm={handleTimeConfirm}
        />
      )}
    </SafeAreaView>
  );
}
