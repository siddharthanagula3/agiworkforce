import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { BellOff, Bell, ChevronDown, Moon } from 'lucide-react-native';
import { BREAK_REMINDER_MINUTES, type TimeFocusWeekday } from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { useNotificationPrefsStore } from '@/stores/notificationPrefsStore';
import {
  SettingsGroup,
  SettingsRow,
  SettingsScreenShell,
  SettingsSwitchRow,
} from '@/src/features/settings/Common';
import { ActionMenuSheet } from '@/src/features/conversation-actions/RenameConversationModal';
import { useActionMenu } from '@/src/shared/hooks/useActionMenu';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { TIME_AND_FOCUS_SCREEN_TITLE } from '../screenTitles';
import { TimePickerModal } from './TimePickerModal';
import { useTimeFocusSync } from './useTimeFocusSync';

const QUIET_HOURS_DAYS: ReadonlyArray<{ value: TimeFocusWeekday; label: string; short: string }> = [
  { value: 0, label: 'Sunday', short: 'S' },
  { value: 1, label: 'Monday', short: 'M' },
  { value: 2, label: 'Tuesday', short: 'T' },
  { value: 3, label: 'Wednesday', short: 'W' },
  { value: 4, label: 'Thursday', short: 'T' },
  { value: 5, label: 'Friday', short: 'F' },
  { value: 6, label: 'Saturday', short: 'S' },
];

const QUIET_HOURS_PICKER_COPY = {
  start: {
    title: 'Quiet Hours Start',
    inputLabel: 'Quiet hours start time',
    quickTimes: ['21:00', '22:00', '23:00'],
  },
  end: {
    title: 'Quiet Hours End',
    inputLabel: 'Quiet hours end time',
    quickTimes: ['06:00', '07:00', '08:00', '09:00'],
  },
} as const;

const DAY_CIRCLE_SIZE = 38;

type BreakReminderChoice = (typeof BREAK_REMINDER_MINUTES)[number] | null;

const BREAK_REMINDER_CHOICES: readonly BreakReminderChoice[] = [null, ...BREAK_REMINDER_MINUTES];

function breakReminderChoiceLabel(minutes: BreakReminderChoice): string {
  if (minutes === null) return 'Off';
  if (minutes < 60) return `${minutes} minutes`;
  return minutes === 60 ? '1 hour' : `${minutes / 60} hours`;
}

function breakReminderValueLabel(minutes: BreakReminderChoice): string {
  if (minutes === null) return 'Off';
  return minutes < 60 ? `After ${minutes} min` : `After ${minutes / 60} hr`;
}

function SectionHeading({ children }: { children: string }) {
  const colors = useThemeColors();
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: colors.textMuted,
        fontSize: typeScale.footnote,
        fontWeight: '600',
        marginBottom: 8,
        paddingHorizontal: 2,
      }}
    >
      {children}
    </Text>
  );
}

function syncStatusLine(sync: ReturnType<typeof useTimeFocusSync>): string {
  switch (sync.status) {
    case 'local':
      return 'Saved on this device. Use AGI Cloud to share with web and desktop.';
    case 'loading':
      return 'Loading your account settings…';
    case 'saving':
      return 'Saving to your account…';
    case 'error':
      return sync.error ?? 'Could not reach your account settings.';
    case 'synced':
      return 'Synced with web and desktop.';
  }
}

export default function TimeFocusScreen() {
  const colors = useThemeColors();
  const quietHours = useNotificationPrefsStore((state) => state.quietHours);
  const breakReminderMinutes = useNotificationPrefsStore((state) => state.breakReminderMinutes);
  const setQuietHours = useNotificationPrefsStore((state) => state.setQuietHours);
  const setBreakReminderMinutes = useNotificationPrefsStore(
    (state) => state.setBreakReminderMinutes,
  );
  const timeFocusSync = useTimeFocusSync();
  const pushTimeFocus = timeFocusSync.push;
  const breakMenu = useActionMenu();
  const openBreakMenu = breakMenu.open;
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

  const chooseBreakReminder = useCallback(
    () =>
      openBreakMenu(
        'Break reminders',
        BREAK_REMINDER_CHOICES.map((minutes) => ({
          key: `break-reminder-${minutes ?? 'off'}`,
          label: breakReminderChoiceLabel(minutes),
          selected: minutes === breakReminderMinutes,
          run: () => {
            setBreakReminderMinutes(minutes);
            pushTimeFocus();
          },
        })),
      ),
    [breakReminderMinutes, openBreakMenu, pushTimeFocus, setBreakReminderMinutes],
  );

  return (
    <SettingsScreenShell
      title={TIME_AND_FOCUS_SCREEN_TITLE}
      overlay={
        <ActionMenuSheet menu={breakMenu.menu} dismissLabel="Dismiss break reminder times" />
      }
    >
      <SectionHeading>Break reminders</SectionHeading>
      <SettingsGroup>
        <View style={{ padding: 14, gap: 12 }}>
          <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote, lineHeight: 19 }}>
            Get a nudge to take a break from AGI.
          </Text>
          <Pressable
            testID="time-focus.break-reminders"
            onPress={chooseBreakReminder}
            accessibilityRole="button"
            accessibilityLabel={`Break reminders. ${breakReminderValueLabel(breakReminderMinutes)}`}
            accessibilityHint="Opens the list of times. One nudge each day after this much time in AGI."
            style={({ pressed }) => ({
              minHeight: 48,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            })}
          >
            <Text
              numberOfLines={1}
              style={{ flexShrink: 1, color: colors.textPrimary, fontSize: typeScale.body }}
            >
              {breakReminderValueLabel(breakReminderMinutes)}
            </Text>
            <ChevronDown size={18} color={colors.textMuted} />
          </Pressable>
          <Text
            testID="time-focus.sync-status"
            accessibilityLiveRegion="polite"
            style={{
              color: timeFocusSync.status === 'error' ? colors.agentError : colors.textMuted,
              fontSize: typeScale.footnote,
              lineHeight: 19,
            }}
          >
            {syncStatusLine(timeFocusSync)}
          </Text>
        </View>
      </SettingsGroup>

      <SectionHeading>Quiet hours</SectionHeading>
      <SettingsGroup
        {...(quietHours.enabled
          ? {
              footnote: 'Agent failures, emergency stops and approval requests still come through.',
            }
          : {})}
      >
        <SettingsSwitchRow
          label="Enable quiet hours"
          description="Suppress non-critical alerts"
          icon={Moon}
          value={quietHours.enabled}
          onValueChange={(enabled) => updateQuietHours({ enabled })}
          testID="time-focus.quiet-hours-switch"
          isLast={!quietHours.enabled}
        />
        {quietHours.enabled ? (
          <>
            <View
              style={{
                padding: 14,
                gap: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>Days</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {QUIET_HOURS_DAYS.map((day) => {
                  const selected = quietHours.days.includes(day.value);
                  return (
                    <Pressable
                      key={day.value}
                      testID={`time-focus.day-${day.value}`}
                      hitSlop={{ top: 3, bottom: 3, left: 3, right: 3 }}
                      onPress={() => toggleQuietHoursDay(day.value)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`${day.label} quiet hours`}
                      style={({ pressed }) => ({
                        width: DAY_CIRCLE_SIZE,
                        height: DAY_CIRCLE_SIZE,
                        borderRadius: DAY_CIRCLE_SIZE / 2,
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
                        maxFontSizeMultiplier={1.3}
                        style={{
                          color: selected ? colors.accentText : colors.textSecondary,
                          fontSize: typeScale.subhead,
                          fontWeight: '600',
                        }}
                      >
                        {day.short}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {quietHours.days.length === 0 ? (
                <Text style={{ color: colors.agentWarning, fontSize: typeScale.footnote }}>
                  Pick at least one day, or quiet hours stay off.
                </Text>
              ) : null}
            </View>
            <SettingsRow
              label="Start time"
              icon={BellOff}
              value={quietHours.startTime}
              onPress={() => setTimePickerField('start')}
            />
            <SettingsRow
              label="End time"
              icon={Bell}
              value={quietHours.endTime}
              onPress={() => setTimePickerField('end')}
              isLast
            />
          </>
        ) : null}
      </SettingsGroup>

      {timePickerField ? (
        <TimePickerModal
          visible
          {...QUIET_HOURS_PICKER_COPY[timePickerField]}
          currentValue={timePickerField === 'start' ? quietHours.startTime : quietHours.endTime}
          onClose={() => setTimePickerField(null)}
          onConfirm={(time) =>
            updateQuietHours(timePickerField === 'start' ? { startTime: time } : { endTime: time })
          }
        />
      ) : null}
    </SettingsScreenShell>
  );
}
