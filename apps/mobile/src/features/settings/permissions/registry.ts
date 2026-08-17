import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { Camera } from 'expo-camera';
import {
  Mic,
  Camera as CameraIcon,
  Image,
  Bell,
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
  applicableLevels: MobilePermissionLevel[];
  levelLabels?: Partial<Record<MobilePermissionLevel, string>>;
  getStatus: () => Promise<OsPermissionStatus>;
  requestPermission: () => Promise<OsPermissionStatus>;
}

function toOsStatus(status: string | undefined, canAskAgain?: boolean): OsPermissionStatus {
  if (status === 'granted') return 'granted';
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

export const PERMISSION_REGISTRY: Readonly<Record<MobilePermissionKind, PermissionRegistryEntry>> =
  Object.freeze({
    microphone: {
      kind: 'microphone',
      label: 'Microphone',
      description: 'Used for voice input and audio recording.',
      icon: Mic,
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
      applicableLevels: ['denied', 'allow_while_using', 'allow_always'],
      getStatus: getPhotosStatus,
      requestPermission: requestPhotos,
    },
    notifications: {
      kind: 'notifications',
      label: 'Notifications',
      description: 'Used for local model, download, and reminder alerts.',
      icon: Bell,
      applicableLevels: ['denied', 'allow_always'],
      getStatus: getNotificationsStatus,
      requestPermission: requestNotifications,
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
      levelLabels: { allow_always: 'Read & write' },
      getStatus: getRemindersStatus,
      requestPermission: requestReminders,
    },
  });

export const PERMISSION_KINDS: MobilePermissionKind[] = [
  'microphone',
  'camera',
  'photos',
  'notifications',
  'calendar',
  ...(Platform.OS === 'ios' ? (['reminders'] as const) : []),
];

export function osStatusToLevel(
  status: OsPermissionStatus,
  kind: MobilePermissionKind,
): MobilePermissionLevel {
  if (status === 'granted') {
    const entry = PERMISSION_REGISTRY[kind];
    return entry.applicableLevels[entry.applicableLevels.length - 1] ?? 'allow_always';
  }
  return 'denied';
}

export function isPermissionGranted(status: OsPermissionStatus): boolean {
  return status === 'granted';
}

export function permissionStatusLabel(
  status: OsPermissionStatus,
  kind: MobilePermissionKind,
): string {
  const entry = PERMISSION_REGISTRY[kind];
  const level: MobilePermissionLevel =
    status === 'undetermined' ? 'ask_each_time' : osStatusToLevel(status, kind);
  return entry.levelLabels?.[level] ?? LEVEL_STATUS_LABELS[level];
}
