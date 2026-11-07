export const NOTIFICATION_DEFAULTS = {
  browserReplyReady: true,
  mobilePushScheduleDone: true,
  emailScheduleDone: true,
  emailSecurityAlerts: true,
  pushUsageReset: true,
} as const;

export type NotifKey = keyof typeof NOTIFICATION_DEFAULTS;
export type NotificationValues = Record<NotifKey, boolean>;
export type NotificationPatch = Partial<NotificationValues>;
