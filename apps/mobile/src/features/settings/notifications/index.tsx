import { useCallback, useState } from 'react';
import { AppState, View, Linking, Platform } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Bell,
  BellOff,
  Bot,
  CalendarClock,
  CheckSquare,
  ChevronRight,
  Code2,
  Gauge,
  Info,
  MessageSquare,
  Moon,
  Clock,
  Sparkles,
  Sunrise,
  Telescope,
  Vibrate,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Switch';
import { Separator } from '@/components/ui/Separator';
import {
  useNotificationPrefsStore,
  type AnnouncedPushGroup,
} from '@/stores/notificationPrefsStore';
import { SettingsScreenShell } from '@/src/features/settings/Common';
import {
  enablePushNotifications,
  getPushDeliveryStatus,
  getPushRegistrationIssue,
  useNotificationCenter,
  type PushDeliveryStatus,
  type PushRegistrationIssue,
} from '@/services/notifications';
import { androidChannelVibrates } from '@/services/notificationChannels';
import { isPushPermissionRequestPending } from '@/services/pushPermissionStatus';
import { useThemeColors } from '@/src/ui/theme';
import type { ColorScheme } from '@/src/ui/theme';
import type { LucideIcon } from 'lucide-react-native';
import {
  ACCOUNT_PUSH_PREFERENCE_GROUP,
  PUSH_PREFERENCE_GROUP_COPY,
  devicePushPreferenceGroups,
  type DevicePushPreferenceGroup,
} from './categories';
import { DAILY_BRIEF_DEFAULT_TIME, DAILY_BRIEF_DESCRIPTION, DAILY_BRIEF_NAME } from './dailyBrief';
import {
  CLOUD_REMINDERS_LOAD_FAILED,
  useCloudReminders,
  type CloudReminders,
} from './useCloudReminders';
import { NOTIFICATIONS_SCREEN_TITLE, TIME_AND_FOCUS_SCREEN_TITLE } from '../screenTitles';
import { useAgentActivityPushSync } from './useAgentActivityPushSync';
import { TimePickerModal } from './TimePickerModal';

interface CategoryMeta {
  id: DevicePushPreferenceGroup;
  label: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
}

function getCategories(c: ColorScheme, announced: readonly AnnouncedPushGroup[]): CategoryMeta[] {
  const presentation: Record<
    DevicePushPreferenceGroup,
    Pick<CategoryMeta, 'icon' | 'iconColor'>
  > = {
    chat_replies: {
      icon: MessageSquare,
      iconColor: c.teal,
    },
    tasks: {
      icon: CheckSquare,
      iconColor: c.agentWarning,
    },
    scheduled_tasks: {
      icon: CalendarClock,
      iconColor: c.agentWarning,
    },
    research: {
      icon: Telescope,
      iconColor: c.teal,
    },
    code: {
      icon: Code2,
      iconColor: c.teal,
    },
    product_updates: {
      icon: Sparkles,
      iconColor: c.teal,
    },
    product: {
      icon: Info,
      iconColor: c.textMuted,
    },
  };
  return devicePushPreferenceGroups(announced).map((id) => ({
    id,
    ...PUSH_PREFERENCE_GROUP_COPY[id],
    ...presentation[id],
  }));
}

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

const DAILY_BRIEF_PICKER_COPY = {
  title: 'Daily Brief Time',
  inputLabel: 'Daily brief time',
  quickTimes: ['07:00', '08:00', '09:00'],
} as const;

function remindersFootnote(reminders: CloudReminders): string | null {
  switch (reminders.status) {
    case 'local':
      return 'Switch to AGI Cloud to use these reminders.';
    case 'signed_out':
      return 'Sign in to AGI Cloud to use these reminders.';
    case 'loading':
      return 'Loading your account settings…';
    case 'error':
      return CLOUD_REMINDERS_LOAD_FAILED;
    case 'ready':
      return (
        (reminders.dailyBrief.shown ? reminders.dailyBrief.error : null) ??
        reminders.usageReset.error ??
        (reminders.dailyBrief.state.enabled ? 'Each brief counts toward your usage limits.' : null)
      );
  }
}

const PERMISSION_COPY: Record<
  Exclude<PushDeliveryStatus, 'unregistered'>,
  { title: string; body: string }
> = {
  granted: {
    title: 'Your device is delivering notifications',
    body: 'Choose below which ones AGI sends.',
  },
  undetermined: {
    title: 'Turn on notifications',
    body: 'Get alerts when an agent needs approval, finishes or fails.',
  },
  denied: {
    title: 'Your device is blocking notifications',
    body: 'Nothing below can reach you until notifications are allowed in Settings.',
  },
};

const REGISTRATION_ISSUE_COPY: Record<PushRegistrationIssue, { title: string; body: string }> = {
  device_token: {
    title: 'AGI Cloud alerts cannot reach this device',
    body: 'This device couldn’t get a push address.',
  },
  server: {
    title: 'AGI Cloud alerts cannot reach this device',
    body: 'AGI Cloud couldn’t register this device yet.',
  },
};

function PushPermissionCard({
  status,
  issue,
  busy,
  onEnable,
}: {
  status: PushDeliveryStatus;
  issue: PushRegistrationIssue | null;
  busy: boolean;
  onEnable: () => void;
}) {
  const colors = useThemeColors();
  const copy =
    status === 'unregistered'
      ? REGISTRATION_ISSUE_COPY[issue ?? 'device_token']
      : PERMISSION_COPY[status];
  const actionLabel =
    status === 'undetermined'
      ? 'Turn on notifications'
      : status === 'unregistered'
        ? 'Try again'
        : 'Open Settings';
  const Icon = status === 'granted' ? Bell : BellOff;

  return (
    <Card>
      <View className="flex-row items-center gap-3 px-1 py-1">
        <Icon size={18} color={status === 'granted' ? colors.teal : colors.agentWarning} />
        <View className="flex-1">
          <Text className="text-sm font-medium" style={{ color: colors.textPrimary }}>
            {copy.title}
          </Text>
          <Text className="text-sm mt-0.5" style={{ color: colors.textMuted }}>
            {copy.body}
          </Text>
        </View>
      </View>
      {status === 'granted' ? null : (
        <Pressable
          onPress={onEnable}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityState={{ disabled: busy }}
          className="mt-3 py-2.5 px-3 rounded-xl items-center"
          style={{ backgroundColor: colors.accentSurface, opacity: busy ? 0.6 : 1 }}
        >
          <Text className="text-sm font-medium" style={{ color: colors.teal }}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </Card>
  );
}

export default function NotificationPreferencesScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { categoryEnabled, vibrationEnabled, setVibrationEnabled } = useNotificationPrefsStore();
  const quietHoursEnabled = useNotificationPrefsStore((state) => state.quietHours.enabled);
  const announcedPushGroups = useNotificationPrefsStore((state) => state.announcedPushGroups);
  const CATEGORIES = getCategories(colors, announcedPushGroups);
  const { unreadCount } = useNotificationCenter();
  const agentActivityPush = useAgentActivityPushSync();
  const reminders = useCloudReminders();

  const [briefPickerOpen, setBriefPickerOpen] = useState(false);
  const [pushPermission, setPushPermission] = useState<PushDeliveryStatus>('undetermined');
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [channelOverridden, setChannelOverridden] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let sequence = 0;
      function readDeviceState() {
        const current = ++sequence;
        const isLatest = () => !cancelled && current === sequence;
        void getPushDeliveryStatus().then((status) => {
          if (isLatest()) setPushPermission(status);
        });
        if (Platform.OS === 'android') {
          void Promise.all(
            (['critical', 'high', 'normal', 'low'] as const).map((priority) =>
              androidChannelVibrates(priority, true),
            ),
          ).then((states) => {
            if (isLatest()) setChannelOverridden(states.some((vibrates) => vibrates === false));
          });
        }
      }
      readDeviceState();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active' && !isPushPermissionRequestPending()) readDeviceState();
      });
      return () => {
        cancelled = true;
        subscription.remove();
      };
    }, []),
  );

  // The one OS prompt is spent here, after the primer above explains what AGI
  // would send. Once the device has answered, only Settings can change it.
  const handleEnablePush = useCallback(async () => {
    if (permissionBusy) return;
    if (pushPermission === 'denied') {
      await Linking.openSettings().catch(() => undefined);
      return;
    }
    setPermissionBusy(true);
    try {
      setPushPermission(await enablePushNotifications());
    } finally {
      setPermissionBusy(false);
    }
  }, [permissionBusy, pushPermission]);

  const { turnOn: turnOnDailyBrief, changeTime: changeDailyBriefTime } = reminders.dailyBrief;
  const dailyBriefEnabled = reminders.dailyBrief.state.enabled;

  const handleTimeConfirm = useCallback(
    (time: string) => {
      if (dailyBriefEnabled) changeDailyBriefTime(time);
      else turnOnDailyBrief(time);
    },
    [changeDailyBriefTime, dailyBriefEnabled, turnOnDailyBrief],
  );

  const handleDailyBriefChange = useCallback(
    (value: boolean) => {
      if (reminders.status === 'local' || reminders.status === 'signed_out') {
        router.push('/(app)/schedules' as Parameters<typeof router.push>[0]);
        return;
      }
      if (value) setBriefPickerOpen(true);
      else reminders.dailyBrief.turnOff();
    },
    [reminders.dailyBrief, reminders.status, router],
  );

  const dailyBriefTime = dailyBriefEnabled
    ? reminders.dailyBrief.state.timeOfDay
    : DAILY_BRIEF_DEFAULT_TIME;
  const remindersReady = reminders.status === 'ready';
  const remindersNote = remindersFootnote(reminders);
  const remindersInCloud = reminders.status !== 'local' && reminders.status !== 'signed_out';
  const dailyBriefLoadFailed =
    remindersReady &&
    reminders.dailyBrief.shown &&
    !reminders.dailyBrief.loaded &&
    reminders.dailyBrief.error !== null;

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
    <SettingsScreenShell title={NOTIFICATIONS_SCREEN_TITLE}>
      <View className="mt-3">
        <Card>
          <Pressable
            testID="notifications.open-recent"
            onPress={() =>
              router.push('/(app)/notifications' as unknown as Parameters<typeof router.push>[0])
            }
            accessibilityRole="link"
            accessibilityLabel={
              unreadCount > 0
                ? `Recent notifications. ${unreadCount} unread`
                : 'Recent notifications'
            }
            className="flex-row items-center justify-between py-3 px-1 rounded-lg"
            style={({ pressed }) => ({
              backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
            })}
          >
            <View className="flex-row items-center gap-3 flex-1 mr-3">
              <Bell size={18} color={colors.textPrimary} />
              <Text className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                Recent notifications
              </Text>
            </View>
            {unreadCount > 0 ? (
              <Text className="text-sm font-medium mr-1" style={{ color: colors.textSecondary }}>
                {unreadCount} unread
              </Text>
            ) : null}
            <ChevronRight size={17} color={colors.textMuted} />
          </Pressable>
        </Card>
      </View>

      <View className="mt-3 mb-2">
        <Text
          className="text-sm uppercase mb-3"
          style={{ color: colors.textMuted, letterSpacing: 0 }}
        >
          Device Permission
        </Text>
      </View>
      <PushPermissionCard
        status={pushPermission}
        issue={pushPermission === 'unregistered' ? getPushRegistrationIssue() : null}
        busy={permissionBusy}
        onEnable={() => void handleEnablePush()}
      />

      <View className="mt-3 mb-2">
        <Text
          className="text-sm uppercase mb-3"
          style={{ color: colors.textMuted, letterSpacing: 0 }}
        >
          Notification Types
        </Text>
      </View>
      <Card>
        {CATEGORIES.map((cat, idx) => {
          const Icon = cat.icon;
          const blocked = pushPermission === 'denied';
          const stateLabel = blocked ? 'Blocked' : categoryEnabled[cat.id] ? 'Push' : 'Off';
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
                disabled={blocked}
                accessibilityLabel={`${cat.label}. ${stateLabel}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: blocked }}
                className="flex-row items-center justify-between py-3 px-1 rounded-lg"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                  opacity: blocked ? 0.5 : 1,
                })}
              >
                <View className="flex-row items-center gap-3 flex-1 mr-3">
                  <Icon size={18} color={cat.iconColor} />
                  <View className="flex-1">
                    <Text className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                      {cat.label}
                    </Text>
                    <Text className="text-sm mt-0.5" style={{ color: colors.textMuted }}>
                      {cat.description}
                    </Text>
                  </View>
                </View>
                <Text className="text-sm font-medium mr-1" style={{ color: colors.textSecondary }}>
                  {stateLabel}
                </Text>
                {blocked ? null : <ChevronRight size={17} color={colors.textMuted} />}
              </Pressable>
            </View>
          );
        })}
      </Card>

      {/* Agent runs. The four categories above are enforced on this device and,
          once registered, by the sender; this switch is the account-level
          consent the cloud agent sender reads before it calls Expo at all. */}
      <View className="mt-6 mb-2">
        <Text
          className="text-sm uppercase mb-3"
          style={{ color: colors.textMuted, letterSpacing: 0 }}
        >
          Agent Runs
        </Text>
      </View>
      <Card>
        <View className="flex-row items-center justify-between py-3 px-1">
          <View className="flex-row items-center gap-3 flex-1 mr-3">
            <Bot size={18} color={colors.teal} />
            <View className="flex-1">
              <Text className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                Agent Run Push
              </Text>
              <Text className="text-sm mt-0.5" style={{ color: colors.textMuted }}>
                Approvals, questions, and finished or failed runs
              </Text>
            </View>
          </View>
          <Switch
            accessibilityLabel="Agent Run Push"
            value={agentActivityPush.enabled}
            disabled={
              !agentActivityPush.ready ||
              agentActivityPush.status === 'local' ||
              agentActivityPush.status === 'saving'
            }
            onValueChange={agentActivityPush.setEnabled}
          />
        </View>
      </Card>
      <Text className="text-sm mt-2 px-1" style={{ color: colors.textMuted }}>
        {agentActivityPush.status === 'local'
          ? 'Switch to AGI Cloud to control agent run alerts.'
          : agentActivityPush.status === 'loading'
            ? 'Loading your account settings…'
            : agentActivityPush.status === 'saving'
              ? 'Saving to your account…'
              : agentActivityPush.status === 'error'
                ? (agentActivityPush.error ?? 'Could not reach your account settings.')
                : pushPermission === 'denied'
                  ? 'Saved, but this device stays silent until notifications are allowed.'
                  : 'Applies on every device on this account.'}
      </Text>

      {agentActivityPush.canRetry ? (
        <Pressable
          onPress={agentActivityPush.retry}
          accessibilityRole="button"
          accessibilityLabel="Retry agent run notifications"
          className="mt-2 px-3 py-2.5 rounded-xl items-center"
          style={{ backgroundColor: colors.accentSurface }}
        >
          <Text className="text-sm font-medium" style={{ color: colors.teal }}>
            Retry
          </Text>
        </Pressable>
      ) : null}

      <View className="mt-6 mb-2">
        <Text
          className="text-sm uppercase mb-3"
          style={{ color: colors.textMuted, letterSpacing: 0 }}
        >
          Reminders
        </Text>
      </View>
      <Card>
        <View className="flex-row items-center justify-between py-3 px-1">
          <View className="flex-row items-center gap-3 flex-1 mr-3">
            <Gauge size={18} color={colors.textSecondary} />
            <View className="flex-1">
              <Text className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                {PUSH_PREFERENCE_GROUP_COPY[ACCOUNT_PUSH_PREFERENCE_GROUP].label}
              </Text>
              <Text className="text-sm mt-0.5" style={{ color: colors.textMuted }}>
                {PUSH_PREFERENCE_GROUP_COPY[ACCOUNT_PUSH_PREFERENCE_GROUP].description}
              </Text>
            </View>
          </View>
          <Switch
            accessibilityLabel={PUSH_PREFERENCE_GROUP_COPY[ACCOUNT_PUSH_PREFERENCE_GROUP].label}
            value={remindersReady && reminders.usageReset.enabled}
            disabled={!remindersReady || reminders.usageReset.saving}
            onValueChange={reminders.usageReset.setEnabled}
          />
        </View>
        {reminders.dailyBrief.shown ? (
          <>
            <Separator />
            <View className="flex-row items-center justify-between py-3 px-1">
              <View className="flex-row items-center gap-3 flex-1 mr-3">
                <Sunrise size={18} color={colors.textSecondary} />
                <View className="flex-1">
                  <Text className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                    {DAILY_BRIEF_NAME}
                  </Text>
                  <Text className="text-sm mt-0.5" style={{ color: colors.textMuted }}>
                    {DAILY_BRIEF_DESCRIPTION}
                  </Text>
                </View>
              </View>
              <Switch
                accessibilityLabel={DAILY_BRIEF_NAME}
                value={remindersInCloud && dailyBriefEnabled}
                disabled={
                  remindersInCloud &&
                  (!remindersReady || !reminders.dailyBrief.loaded || reminders.dailyBrief.saving)
                }
                onValueChange={handleDailyBriefChange}
              />
            </View>
            {remindersReady && dailyBriefEnabled ? (
              <>
                <Separator />
                <Pressable
                  onPress={() => setBriefPickerOpen(true)}
                  disabled={reminders.dailyBrief.saving}
                  className="flex-row items-center justify-between py-3 px-1 rounded-lg"
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                  })}
                  accessibilityLabel={`Daily brief time, ${reminders.dailyBrief.state.timeOfDay}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: reminders.dailyBrief.saving }}
                >
                  <View className="flex-row items-center gap-3">
                    <Clock size={18} color={colors.textSecondary} />
                    <Text className="text-sm" style={{ color: colors.textPrimary }}>
                      Time
                    </Text>
                  </View>
                  <View
                    className="px-3 py-1.5 rounded-lg"
                    style={{ backgroundColor: colors.accentSurface }}
                  >
                    <Text className="text-sm font-medium" style={{ color: colors.teal }}>
                      {reminders.dailyBrief.state.timeOfDay}
                    </Text>
                  </View>
                </Pressable>
              </>
            ) : null}
          </>
        ) : null}
      </Card>
      {remindersNote ? (
        <Text className="text-sm mt-2 px-1" style={{ color: colors.textMuted }}>
          {remindersNote}
        </Text>
      ) : null}

      {reminders.status === 'error' || dailyBriefLoadFailed ? (
        <Pressable
          onPress={reminders.retry}
          accessibilityRole="button"
          accessibilityLabel="Retry reminders"
          className="mt-2 px-3 py-2.5 rounded-xl items-center"
          style={{ backgroundColor: colors.accentSurface }}
        >
          <Text className="text-sm font-medium" style={{ color: colors.teal }}>
            Retry
          </Text>
        </Pressable>
      ) : null}

      <View className="mt-6">
        <Card>
          <Pressable
            testID="notifications.open-quiet-hours"
            onPress={() =>
              router.push('/(app)/settings/time-and-focus' as Parameters<typeof router.push>[0])
            }
            accessibilityRole="button"
            accessibilityLabel={`Quiet hours. ${quietHoursEnabled ? 'On' : 'Off'}`}
            accessibilityHint={`Opens ${TIME_AND_FOCUS_SCREEN_TITLE}`}
            className="flex-row items-center justify-between py-3 px-1 rounded-lg"
            style={({ pressed }) => ({
              backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
            })}
          >
            <View className="flex-row items-center gap-3 flex-1 mr-3">
              <Moon size={18} color={colors.textSecondary} />
              <Text className="text-sm font-medium" style={{ color: colors.textPrimary }}>
                Quiet hours
              </Text>
            </View>
            <Text className="text-sm font-medium mr-1" style={{ color: colors.textSecondary }}>
              {quietHoursEnabled ? 'On' : 'Off'}
            </Text>
            <ChevronRight size={17} color={colors.textMuted} />
          </Pressable>
        </Card>
      </View>

      {/* Vibration is a per-channel Android setting. iOS gives an app no way to
          vibrate without sound, so there is nothing here to offer. */}
      {Platform.OS !== 'android' ? null : (
        <>
          <View className="mt-6 mb-2">
            <Text
              className="text-sm uppercase mb-3"
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
          {channelOverridden ? (
            <Text className="text-sm mt-2 px-1" style={{ color: colors.textMuted }}>
              Device settings turned vibration off for a channel, overriding these switches.
            </Text>
          ) : null}
        </>
      )}

      {/* RN renders Modal in its own host view, so it adds no layout to the
          shell's scroll content. */}
      {briefPickerOpen && (
        <TimePickerModal
          visible
          {...DAILY_BRIEF_PICKER_COPY}
          currentValue={dailyBriefTime}
          onClose={() => setBriefPickerOpen(false)}
          onConfirm={handleTimeConfirm}
        />
      )}
    </SettingsScreenShell>
  );
}
