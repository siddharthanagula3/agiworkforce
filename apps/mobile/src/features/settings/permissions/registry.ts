/**
 * Permission registry
 *
 * Maps each MobilePermissionKind to its icon, labels, applicable OS levels,
 * and the Expo API adapter for reading/requesting status.
 *
 * API surface notes (expo-camera@55, expo-image-picker@55, expo-notifications@55,
 * expo-contacts@55):
 *   - expo-location is NOT a dependency, so there is no Location entry at all.
 *     The stub adapters that used to sit here hard-returned 'undetermined' and
 *     the kind was excluded from PERMISSION_KINDS, so the row could never
 *     render while the registry still claimed to model it. Adding Location back
 *     means adding the dependency and a real adapter in the same change.
 *   - expo-camera@55 exposes getCameraPermissionsAsync / requestCameraPermissionsAsync
 *     and getMicrophonePermissionsAsync / requestMicrophonePermissionsAsync on the
 *     `Camera` named export (not as namespace-level functions).
 *
 * Rules for requesting:
 *   - NEVER call requestPermissionsAsync() on screen mount. Only on user action.
 *   - On screen mount (and on focus return) call getPermissionsAsync() to read
 *     current OS state without triggering a prompt.
 *   - Tapping the toggle or a level radio:
 *       * If OS is undetermined → call requestPermissionsAsync()
 *       * If OS is denied (canAskAgain = false) → open Settings
 *       * If requesting a downgrade → open Settings with explanation
 */
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Contacts from 'expo-contacts';
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { Camera } from 'expo-camera';
import {
  Mic,
  Camera as CameraIcon,
  Image,
  Bell,
  Users,
  CalendarDays,
  ListChecks,
  type LucideIcon,
} from 'lucide-react-native';
import {
  LEVEL_STATUS_LABELS,
  type MobilePermissionKind,
  type MobilePermissionLevel,
  type OsPermissionStatus,
} from './types';

export interface PermissionRegistryEntry {
  kind: MobilePermissionKind;
  label: string;
  description: string;
  icon: LucideIcon;
  /** The levels applicable to this permission kind (ordered lowest → highest). */
  applicableLevels: MobilePermissionLevel[];
  /**
   * Per-kind overrides for `LEVEL_STATUS_LABELS`, for grants the generic words
   * describe inaccurately. Only set this where the shared label would mislead.
   */
  levelLabels?: Partial<Record<MobilePermissionLevel, string>>;
  /** Read current OS status without prompting. */
  getStatus: () => Promise<OsPermissionStatus>;
  /** Request a higher OS permission. May or may not prompt (OS decides). */
  requestPermission: () => Promise<OsPermissionStatus>;
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

function toOsStatus(status: string | undefined, canAskAgain?: boolean): OsPermissionStatus {
  if (status === 'granted') return 'granted';
  // 'denied' with canAskAgain=true means 'undetermined' on some Expo versions
  if (status === 'undetermined' || canAskAgain === true) return 'undetermined';
  return 'denied';
}

async function getMicStatus(): Promise<OsPermissionStatus> {
  const result = await Camera.getMicrophonePermissionsAsync();
  return toOsStatus(result.status, result.canAskAgain);
}

async function requestMic(): Promise<OsPermissionStatus> {
  const result = await Camera.requestMicrophonePermissionsAsync();
  return toOsStatus(result.status, result.canAskAgain);
}

async function getCameraStatus(): Promise<OsPermissionStatus> {
  const result = await Camera.getCameraPermissionsAsync();
  return toOsStatus(result.status, result.canAskAgain);
}

async function requestCamera(): Promise<OsPermissionStatus> {
  const result = await Camera.requestCameraPermissionsAsync();
  return toOsStatus(result.status, result.canAskAgain);
}

async function getPhotosStatus(): Promise<OsPermissionStatus> {
  const result = await ImagePicker.getMediaLibraryPermissionsAsync();
  return toOsStatus(result.status, result.canAskAgain);
}

async function requestPhotos(): Promise<OsPermissionStatus> {
  const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return toOsStatus(result.status, result.canAskAgain);
}

async function getNotificationsStatus(): Promise<OsPermissionStatus> {
  const result = await Notifications.getPermissionsAsync();
  return toOsStatus(result.status, result.canAskAgain);
}

async function requestNotifications(): Promise<OsPermissionStatus> {
  const result = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return toOsStatus(result.status, result.canAskAgain);
}

async function getContactsStatus(): Promise<OsPermissionStatus> {
  const result = await Contacts.getPermissionsAsync();
  return toOsStatus(result.status, result.canAskAgain);
}

async function requestContacts(): Promise<OsPermissionStatus> {
  const result = await Contacts.requestPermissionsAsync();
  return toOsStatus(result.status, result.canAskAgain);
}

async function getCalendarStatus(): Promise<OsPermissionStatus> {
  const result = await Calendar.getCalendarPermissionsAsync();
  return toOsStatus(result.status, result.canAskAgain);
}

async function requestCalendar(): Promise<OsPermissionStatus> {
  const result = await Calendar.requestCalendarPermissionsAsync();
  return toOsStatus(result.status, result.canAskAgain);
}

async function getRemindersStatus(): Promise<OsPermissionStatus> {
  if (Platform.OS !== 'ios') return 'denied';
  const result = await Calendar.getRemindersPermissionsAsync();
  return toOsStatus(result.status, result.canAskAgain);
}

async function requestReminders(): Promise<OsPermissionStatus> {
  if (Platform.OS !== 'ios') return 'denied';
  const result = await Calendar.requestRemindersPermissionsAsync();
  return toOsStatus(result.status, result.canAskAgain);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const PERMISSION_REGISTRY: Readonly<Record<MobilePermissionKind, PermissionRegistryEntry>> =
  Object.freeze({
    microphone: {
      kind: 'microphone',
      label: 'Microphone',
      description: 'Used for voice input and audio recording.',
      icon: Mic,
      // iOS: off / ask / while-using (no always-on microphone)
      applicableLevels: ['denied', 'ask_each_time', 'allow_while_using'],
      getStatus: getMicStatus,
      requestPermission: requestMic,
    },
    camera: {
      kind: 'camera',
      label: 'Camera',
      description: 'Used for photo capture and document scanning.',
      icon: CameraIcon,
      applicableLevels: ['denied', 'ask_each_time', 'allow_while_using'],
      getStatus: getCameraStatus,
      requestPermission: requestCamera,
    },
    photos: {
      kind: 'photos',
      label: 'Photos & Files',
      description: 'Used to attach images and documents from your library.',
      icon: Image,
      // iOS: denied / limited (≈ while-using) / full (≈ always)
      applicableLevels: ['denied', 'allow_while_using', 'allow_always'],
      getStatus: getPhotosStatus,
      requestPermission: requestPhotos,
    },
    notifications: {
      kind: 'notifications',
      label: 'Notifications',
      description: 'Used for local model, download, and reminder alerts.',
      icon: Bell,
      // Notifications is effectively binary on iOS/Android — no while-using semantics
      applicableLevels: ['denied', 'allow_always'],
      getStatus: getNotificationsStatus,
      requestPermission: requestNotifications,
    },
    contacts: {
      kind: 'contacts',
      label: 'Contacts',
      description: 'Optional. Used only when you choose contact lookup.',
      icon: Users,
      applicableLevels: ['denied', 'ask_each_time', 'allow_while_using'],
      getStatus: getContactsStatus,
      requestPermission: requestContacts,
    },
    calendar: {
      kind: 'calendar',
      label: 'Calendar',
      description: 'Optional. Used only after you enable device calendar context.',
      icon: CalendarDays,
      applicableLevels: ['denied', 'allow_always'],
      getStatus: getCalendarStatus,
      requestPermission: requestCalendar,
    },
    reminders: {
      kind: 'reminders',
      label: 'Reminders',
      description:
        'Used only when you explicitly create an Apple Reminder; never read automatically.',
      icon: ListChecks,
      applicableLevels: ['denied', 'allow_always'],
      // The iOS Reminders grant is what `createReminderAsync` writes through
      // (src/features/reminders/service.ts), so "Always" understates it —
      // granting it hands the app write access to the user's reminders.
      levelLabels: { allow_always: 'Read & write' },
      getStatus: getRemindersStatus,
      requestPermission: requestReminders,
    },
  });

/** Ordered list for display on the permissions index screen. */
export const PERMISSION_KINDS: MobilePermissionKind[] = [
  'microphone',
  'camera',
  'photos',
  'notifications',
  'contacts',
  'calendar',
  ...(Platform.OS === 'ios' ? (['reminders'] as const) : []),
];

/**
 * Derive the best MobilePermissionLevel from an OS status.
 * Used to pre-select the correct radio in the detail screen on mount.
 */
export function osStatusToLevel(
  status: OsPermissionStatus,
  kind: MobilePermissionKind,
): MobilePermissionLevel {
  if (status === 'granted') {
    // Default to the highest applicable level when granted
    const entry = PERMISSION_REGISTRY[kind];
    return entry.applicableLevels[entry.applicableLevels.length - 1] ?? 'allow_always';
  }
  return 'denied';
}

/**
 * Returns true when the granted status means the toggle should be "on".
 */
export function isPermissionGranted(status: OsPermissionStatus): boolean {
  return status === 'granted';
}

/**
 * The label for the level a permission is actually at right now — the string
 * the permissions list renders in its trailing slot and speaks to VoiceOver.
 *
 * `osStatusToLevel` cannot answer this alone: it folds 'undetermined' into
 * 'denied' (correct for pre-selecting a radio, since there is no OS grant
 * either way), which would tell the user a permission was refused when the OS
 * simply has not asked yet. So 'undetermined' resolves to the 'Ask' label
 * directly and every other status goes through `osStatusToLevel`.
 */
export function permissionStatusLabel(
  status: OsPermissionStatus,
  kind: MobilePermissionKind,
): string {
  const entry = PERMISSION_REGISTRY[kind];
  const level: MobilePermissionLevel =
    status === 'undetermined' ? 'ask_each_time' : osStatusToLevel(status, kind);
  return entry.levelLabels?.[level] ?? LEVEL_STATUS_LABELS[level];
}
