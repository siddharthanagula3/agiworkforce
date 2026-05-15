/**
 * Notification Preferences Screen
 *
 * Per-category toggles, quiet hours, and vibration settings for push
 * notifications delivered by the companion bridge.
 */
import { useCallback, useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Bell,
  BellOff,
  CheckSquare,
  AlertTriangle,
  AlertOctagon,
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
import { Button } from '@/components/ui/button';
import {
  useNotificationPrefsStore,
  type NotificationCategory,
} from '@/stores/notificationPrefsStore';
import { useThemeColors } from '@/hooks/useTheme';
import type { ColorScheme } from '@/lib/theme';
import type { LucideIcon } from 'lucide-react-native';

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
  return [
    {
      id: 'approvals',
      label: 'Approvals',
      description: 'Agent action approval requests',
      icon: CheckSquare,
      iconColor: c.agentWarning,
    },
    {
      id: 'task_updates',
      label: 'Task Updates',
      description: 'Task completed, paused, or resumed',
      icon: Info,
      iconColor: c.teal,
    },
    {
      id: 'errors',
      label: 'Errors & Stops',
      description: 'Agent failures and emergency stops',
      icon: AlertOctagon,
      iconColor: c.agentError,
    },
    {
      id: 'status',
      label: 'Status Updates',
      description: 'Heartbeat and connection info',
      icon: AlertTriangle,
      iconColor: c.textMuted,
    },
  ];
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
  return (
    <View className="flex-row items-center justify-between py-2.5 px-1">
      <View className="flex-row items-center gap-3">
        <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
        <Text className="text-sm text-white">{label}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} />
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
  const [value, setValue] = useState(currentValue);

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
        className="flex-1 justify-center items-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        onPress={onClose}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              className="rounded-2xl p-5 mx-6"
              style={{ backgroundColor: colors.surfaceOverlay, minWidth: 280 }}
            >
              {/* Header */}
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-[15px] font-semibold text-white">
                  {field === 'start' ? 'Quiet Hours Start' : 'Quiet Hours End'}
                </Text>
                <Pressable
                  onPress={onClose}
                  className="w-7 h-7 rounded-full items-center justify-center active:bg-white/10"
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
                  autoFocus
                  selectTextOnFocus
                />
              </View>

              {/* Quick times */}
              <View className="flex-row flex-wrap gap-2 mb-4">
                {QUICK_TIMES.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setValue(t)}
                    className="px-3 py-1.5 rounded-lg active:opacity-70"
                    style={{
                      backgroundColor: value === t ? `${colors.teal}25` : colors.surfaceElevated,
                      borderWidth: value === t ? 1 : 0,
                      borderColor: colors.teal,
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
              <View className="flex-row gap-3">
                <Button
                  title="Cancel"
                  variant="ghost"
                  size="sm"
                  onPress={onClose}
                  className="flex-1"
                />
                <Button
                  title="Set Time"
                  variant="primary"
                  size="sm"
                  onPress={handleConfirm}
                  className="flex-1"
                />
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
    setCategoryEnabled,
    setVibrationEnabled,
    setQuietHours,
  } = useNotificationPrefsStore();
  const CATEGORIES = getCategories(colors);

  const [timePickerField, setTimePickerField] = useState<'start' | 'end' | null>(null);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/settings' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleOpenTimePicker = useCallback((field: 'start' | 'end') => {
    setTimePickerField(field);
  }, []);

  const handleTimeConfirm = useCallback(
    (time: string) => {
      if (timePickerField === 'start') {
        setQuietHours({ startTime: time });
      } else if (timePickerField === 'end') {
        setQuietHours({ endTime: time });
      }
    },
    [timePickerField, setQuietHours],
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
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center px-3 h-12">
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2 flex-1">
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
          <Text className="text-[11px] text-white/40 uppercase tracking-wider mb-3">
            Notification Types
          </Text>
        </View>
        <Card>
          {CATEGORIES.map((cat, idx) => {
            const Icon = cat.icon;
            return (
              <View key={cat.id}>
                {idx > 0 && <Separator />}
                <View className="flex-row items-center justify-between py-3 px-1">
                  <View className="flex-row items-center gap-3 flex-1 mr-3">
                    <Icon size={18} color={cat.iconColor} />
                    <View className="flex-1">
                      <Text className="text-sm text-white font-medium">{cat.label}</Text>
                      <Text className="text-[11px] text-white/40 mt-0.5">{cat.description}</Text>
                    </View>
                  </View>
                  <Switch
                    value={categoryEnabled[cat.id]}
                    onValueChange={(v) => setCategoryEnabled(cat.id, v)}
                  />
                </View>
              </View>
            );
          })}
        </Card>

        {/* Quiet hours */}
        <View className="mt-6 mb-2">
          <Text className="text-[11px] text-white/40 uppercase tracking-wider mb-3">
            Quiet Hours
          </Text>
        </View>
        <Card>
          {/* Master toggle */}
          <View className="flex-row items-center justify-between py-3 px-1">
            <View className="flex-row items-center gap-3">
              <Moon size={18} color={colors.textSecondary} />
              <View>
                <Text className="text-sm text-white font-medium">Enable Quiet Hours</Text>
                <Text className="text-[11px] text-white/40 mt-0.5">
                  Suppress non-critical alerts
                </Text>
              </View>
            </View>
            <Switch
              value={quietHours.enabled}
              onValueChange={(v) => setQuietHours({ enabled: v })}
            />
          </View>

          {quietHours.enabled && (
            <>
              <Separator />
              {/* Start time */}
              <Pressable
                onPress={() => handleOpenTimePicker('start')}
                className="flex-row items-center justify-between py-3 px-1 active:bg-white/5 rounded-lg"
                accessibilityLabel="Set quiet hours start time"
                accessibilityRole="button"
              >
                <View className="flex-row items-center gap-3">
                  <BellOff size={18} color={colors.textSecondary} />
                  <Text className="text-sm text-white">Start Time</Text>
                </View>
                <View
                  className="px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: `${colors.teal}15` }}
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
                className="flex-row items-center justify-between py-3 px-1 active:bg-white/5 rounded-lg"
                accessibilityLabel="Set quiet hours end time"
                accessibilityRole="button"
              >
                <View className="flex-row items-center gap-3">
                  <Bell size={18} color={colors.textSecondary} />
                  <Text className="text-sm text-white">End Time</Text>
                </View>
                <View
                  className="px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: `${colors.teal}15` }}
                >
                  <Text className="text-sm font-medium" style={{ color: colors.teal }}>
                    {quietHours.endTime}
                  </Text>
                </View>
              </Pressable>

              <View
                className="mt-3 mx-1 px-3 py-2 rounded-lg"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
              >
                <Text className="text-[11px] text-white/40 leading-4">
                  Critical notifications (agent failures, emergency stops, approval requests) always
                  bypass quiet hours.
                </Text>
              </View>
            </>
          )}
        </Card>

        {/* Vibration */}
        <View className="mt-6 mb-2">
          <Text className="text-[11px] text-white/40 uppercase tracking-wider mb-3">Vibration</Text>
        </View>
        <Card>
          <View className="flex-row items-center gap-3 mb-3 px-1">
            <Vibrate size={18} color={colors.textSecondary} />
            <Text className="text-sm text-white/70">Vibrate per priority level</Text>
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
