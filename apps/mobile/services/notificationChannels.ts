import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { notificationLedColors } from '@/src/ui/theme/tokens';

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';

export const NOTIFICATION_PRIORITIES: readonly NotificationPriority[] = [
  'critical',
  'high',
  'normal',
  'low',
];

const ANDROID_CHANNELS: Record<
  NotificationPriority,
  {
    name: string;
    vibrationPattern: number[];
    lightColor: string;
    bypassDnd?: boolean;
    sound?: string;
  }
> = {
  critical: {
    name: 'Critical Alerts',
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    lightColor: notificationLedColors.critical,
    bypassDnd: true,
    sound: 'default',
  },
  high: {
    name: 'High Priority',
    vibrationPattern: [0, 300, 200, 300],
    lightColor: notificationLedColors.high,
    sound: 'default',
  },
  normal: { name: 'Normal', vibrationPattern: [0, 250], lightColor: notificationLedColors.normal },
  low: {
    name: 'Status Updates',
    vibrationPattern: [0, 150],
    lightColor: notificationLedColors.low,
  },
};

function androidImportance(priority: NotificationPriority): number {
  const levels = Notifications.AndroidImportance;
  switch (priority) {
    case 'critical':
      return levels.MAX;
    case 'high':
      return levels.HIGH;
    case 'normal':
      return levels.DEFAULT;
    case 'low':
      return levels.MIN;
  }
}

// Android freezes a channel's vibration when the channel is created, so a
// toggle can only pick between channels, never edit one. Each priority
// therefore owns a vibrating channel and a silent twin.
const SILENT_CHANNEL_SUFFIX = '-no-vibration';

export function androidChannelId(priority: NotificationPriority, vibrate: boolean): string {
  return vibrate ? priority : `${priority}${SILENT_CHANNEL_SUFFIX}`;
}

export async function registerAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  for (const priority of NOTIFICATION_PRIORITIES) {
    const channel = ANDROID_CHANNELS[priority];
    for (const vibrate of [true, false]) {
      await Notifications.setNotificationChannelAsync(androidChannelId(priority, vibrate), {
        name: vibrate ? channel.name : `${channel.name} (silent)`,
        importance: androidImportance(priority),
        enableVibrate: vibrate,
        vibrationPattern: vibrate ? channel.vibrationPattern : null,
        lightColor: channel.lightColor,
        sound: channel.sound,
        bypassDnd: channel.bypassDnd,
      });
    }
  }
}

export async function androidChannelVibrates(
  priority: NotificationPriority,
  vibrate: boolean,
): Promise<boolean | null> {
  if (Platform.OS !== 'android') return null;
  const channel = await Notifications.getNotificationChannelAsync(
    androidChannelId(priority, vibrate),
  );
  return channel ? channel.enableVibrate : null;
}

export const IOS_INTERRUPTION_LEVELS: Record<
  NotificationPriority,
  Notifications.InterruptionLevel
> = {
  critical: 'timeSensitive',
  high: 'timeSensitive',
  normal: 'active',
  low: 'passive',
};
