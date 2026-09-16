export type MobilePermissionKind =
  'microphone' | 'camera' | 'photos' | 'notifications' | 'calendar' | 'reminders';

export type MobilePermissionLevel =
  'denied' | 'ask_each_time' | 'allow_while_using' | 'allow_always';

export type OsPermissionStatus = 'undetermined' | 'granted' | 'denied';

export interface StoredPermissionState {
  lastObservedStatus: OsPermissionStatus;
}

export const LEVEL_STATUS_LABELS: Readonly<Record<MobilePermissionLevel, string>> = Object.freeze({
  denied: 'Never',
  ask_each_time: 'Ask',
  allow_while_using: 'While using',
  allow_always: 'Always',
});

export const STATUS_HEADLINES: Readonly<Record<OsPermissionStatus, string>> = Object.freeze({
  granted: 'Access Granted',
  undetermined: 'Not Requested',
  denied: 'Access Denied',
});

export const STATUS_EXPLANATIONS: Readonly<Record<OsPermissionStatus, string>> = Object.freeze({
  granted: 'Your device is allowing this. You can revoke it in Settings at any time.',
  undetermined: 'Your device has not been asked yet. Nothing is accessed until you allow it.',
  denied: 'Your device is blocking this. Only Settings can change it.',
});
