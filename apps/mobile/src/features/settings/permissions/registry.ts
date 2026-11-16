import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Calendar from 'expo-calendar/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Platform } from 'react-native';
import { Camera } from 'expo-camera';
import {
  Mic,
  AudioLines,
  ScanFace,
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
  statusHeadlines?: Partial<Record<OsPermissionStatus, string>>;
  statusExplanations?: Partial<Record<OsPermissionStatus, string>>;
  request?: { label: string; hint: string };
  isAvailable?: () => Promise<boolean>;
  getStatus: () => Promise<OsPermissionStatus>;
  requestPermission: () => Promise<OsPermissionStatus>;
}

function toOsStatus(status: string | undefined): OsPermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'undetermined') return 'undetermined';
  return 'denied';
}

async function getMicStatus(): Promise<OsPermissionStatus> {
  const result = await Camera.getMicrophonePermissionsAsync();
  return toOsStatus(result.status);
}

async function requestMic(): Promise<OsPermissionStatus> {
  const result = await Camera.requestMicrophonePermissionsAsync();
  return toOsStatus(result.status);
}

async function getSpeechRecognitionStatus(): Promise<OsPermissionStatus> {
  const result = await ExpoSpeechRecognitionModule.getSpeechRecognizerPermissionsAsync();
  return toOsStatus(result.status);
}

async function requestSpeechRecognition(): Promise<OsPermissionStatus> {
  const result = await ExpoSpeechRecognitionModule.requestSpeechRecognizerPermissionsAsync();
  return toOsStatus(result.status);
}

async function getCameraStatus(): Promise<OsPermissionStatus> {
  const result = await Camera.getCameraPermissionsAsync();
  return toOsStatus(result.status);
}

async function requestCamera(): Promise<OsPermissionStatus> {
  const result = await Camera.requestCameraPermissionsAsync();
  return toOsStatus(result.status);
}

async function getPhotosStatus(): Promise<OsPermissionStatus> {
  const result = await ImagePicker.getMediaLibraryPermissionsAsync();
  return toOsStatus(result.status);
}

async function requestPhotos(): Promise<OsPermissionStatus> {
  const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return toOsStatus(result.status);
}

async function getNotificationsStatus(): Promise<OsPermissionStatus> {
  const result = await Notifications.getPermissionsAsync();
  return toOsStatus(result.status);
}

async function requestNotifications(): Promise<OsPermissionStatus> {
  const result = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return toOsStatus(result.status);
}

async function getCalendarStatus(): Promise<OsPermissionStatus> {
  const result = await Calendar.getCalendarPermissionsAsync();
  return toOsStatus(result.status);
}

async function requestCalendar(): Promise<OsPermissionStatus> {
  const result = await Calendar.requestCalendarPermissionsAsync();
  return toOsStatus(result.status);
}

async function getRemindersStatus(): Promise<OsPermissionStatus> {
  if (Platform.OS !== 'ios') return 'denied';
  const result = await Calendar.getRemindersPermissionsAsync();
  return toOsStatus(result.status);
}

async function requestReminders(): Promise<OsPermissionStatus> {
  if (Platform.OS !== 'ios') return 'denied';
  const result = await Calendar.requestRemindersPermissionsAsync();
  return toOsStatus(result.status);
}

async function isFaceIdDevice(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  return types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
}

let faceIdConfirmedThisSession = false;

// iOS gives no Face ID status before an app uses it: canEvaluatePolicy succeeds
// both before the person is asked and after they allow it, and fails once Face
// ID is off for the app or has no face set up. Only a successful Face ID check
// proves it is allowed.
async function getFaceIdStatus(): Promise<OsPermissionStatus> {
  const usable = (await isFaceIdDevice()) && (await LocalAuthentication.isEnrolledAsync());
  if (!usable) {
    faceIdConfirmedThisSession = false;
    return 'denied';
  }
  return faceIdConfirmedThisSession ? 'granted' : 'undetermined';
}

async function requestFaceId(): Promise<OsPermissionStatus> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Check Face ID for App Lock',
    cancelLabel: 'Cancel',
    disableDeviceFallback: true,
  });
  if (result.success) {
    faceIdConfirmedThisSession = true;
    return 'granted';
  }
  return getFaceIdStatus();
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
    speechRecognition: {
      kind: 'speechRecognition',
      label: 'Speech Recognition',
      description: 'Used to turn your voice input into text on this device.',
      icon: AudioLines,
      applicableLevels: ['denied', 'allow_while_using'],
      getStatus: getSpeechRecognitionStatus,
      requestPermission: requestSpeechRecognition,
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
      description: 'Used when you ask about your schedule or confirm an event.',
      icon: CalendarDays,
      applicableLevels: ['denied', 'allow_always'],
      getStatus: getCalendarStatus,
      requestPermission: requestCalendar,
    },
    reminders: {
      kind: 'reminders',
      label: 'Reminders',
      description: 'Used only to add reminders you create or confirm; never read.',
      icon: ListChecks,
      applicableLevels: ['denied', 'allow_always'],
      levelLabels: { allow_always: 'Full access' },
      getStatus: getRemindersStatus,
      requestPermission: requestReminders,
    },
    faceId: {
      kind: 'faceId',
      label: 'Face ID',
      description: 'Used only to unlock the app when App Lock is on.',
      icon: ScanFace,
      applicableLevels: ['denied', 'allow_while_using'],
      levelLabels: { allow_while_using: 'Allowed' },
      statusHeadlines: { undetermined: 'Not Confirmed' },
      statusExplanations: {
        undetermined: 'Your device asks the first time Face ID is used, then keeps your answer.',
      },
      request: {
        label: 'Check Face ID',
        hint: 'Your device asks first if you have not decided yet.',
      },
      isAvailable: isFaceIdDevice,
      getStatus: getFaceIdStatus,
      requestPermission: requestFaceId,
    },
  });

export const PERMISSION_KINDS: MobilePermissionKind[] = [
  'microphone',
  ...(Platform.OS === 'ios' ? (['speechRecognition'] as const) : []),
  'camera',
  ...(Platform.OS === 'ios' ? (['photos'] as const) : []),
  'notifications',
  'calendar',
  ...(Platform.OS === 'ios' ? (['reminders', 'faceId'] as const) : []),
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
