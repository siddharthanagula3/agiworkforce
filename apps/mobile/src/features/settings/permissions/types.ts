export type MobilePermissionKind =
  | 'microphone'
  | 'camera'
  | 'photos'
  | 'notifications'
  | 'calendar'
  | 'reminders';

export type MobilePermissionLevel =
  | 'denied'
  | 'ask_each_time'
  | 'allow_while_using'
  | 'allow_always';

export type OsPermissionStatus = 'undetermined' | 'granted' | 'denied';

export interface StoredPermissionState {
  lastObservedStatus: OsPermissionStatus;
  userIntent: MobilePermissionLevel;
}

export const LEVEL_LABELS: Readonly<Record<MobilePermissionLevel, string>> = Object.freeze({
  denied: 'Never',
  ask_each_time: 'Ask each time',
  allow_while_using: 'While using the app',
  allow_always: 'Always',
});

export const LEVEL_STATUS_LABELS: Readonly<Record<MobilePermissionLevel, string>> = Object.freeze({
  denied: 'Never',
  ask_each_time: 'Ask',
  allow_while_using: 'While using',
  allow_always: 'Always',
});

export const LEVEL_DESCRIPTIONS: Readonly<Record<MobilePermissionLevel, string>> = Object.freeze({
  denied: 'App cannot access this permission.',
  ask_each_time: 'The OS will ask each time the app needs access.',
  allow_while_using: 'Access is granted only while the app is in the foreground.',
  allow_always: 'Access is granted in foreground and background.',
});
