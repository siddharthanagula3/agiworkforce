/**
 * Permission registry
 *
 * Maps each MobilePermissionKind to its icon, labels, applicable OS levels,
 * and the Expo API adapter for reading/requesting status.
 *
 * API surface notes (expo-camera@55, expo-image-picker@55, expo-notifications@55,
 * expo-contacts@55):
 *   - expo-location is NOT a dependency. Location permission is surfaced to the
 *     user as a UI row but deferred to the OS Settings app for actual change —
 *     we open Linking.openSettings() and reflect whatever the OS reports via
 *     expo-contacts (contacts) or camera. For location specifically, we use a
 *     no-op getStatus that returns 'undetermined' and route all interactions to
 *     Settings. (expo-location can be wired in a future sprint when the package
 *     is added as a dependency.)
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
import { Camera } from 'expo-camera';
import {
  Mic,
  Camera as CameraIcon,
  MapPin,
  Image,
  Bell,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import type { MobilePermissionKind, MobilePermissionLevel, OsPermissionStatus } from './types';

export interface PermissionRegistryEntry {
  kind: MobilePermissionKind;
  label: string;
  description: string;
  icon: LucideIcon;
  /** The levels applicable to this permission kind (ordered lowest → highest). */
  applicableLevels: MobilePermissionLevel[];
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

// expo-location is not installed. Location permission is displayed but all
// changes route through the OS Settings app. We report 'undetermined' until
// expo-location is added as a dependency.
async function getLocationStatus(): Promise<OsPermissionStatus> {
  return 'undetermined';
}

async function requestLocation(): Promise<OsPermissionStatus> {
  // Cannot request without expo-location — caller's handleSelectLevel will
  // detect 'undetermined' and try to call this, but the UI should route to
  // Settings for location. This returns 'undetermined' as a safe fallback.
  return 'undetermined';
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
    location: {
      kind: 'location',
      label: 'Location',
      description: 'Used for location-aware queries and context.',
      icon: MapPin,
      // Location has all 4 levels. Actual permission request routes through
      // OS Settings until expo-location is added as a dependency.
      applicableLevels: ['denied', 'ask_each_time', 'allow_while_using', 'allow_always'],
      getStatus: getLocationStatus,
      requestPermission: requestLocation,
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
      description: 'Used for agent status, approvals, and task alerts.',
      icon: Bell,
      // Notifications is effectively binary on iOS/Android — no while-using semantics
      applicableLevels: ['denied', 'allow_always'],
      getStatus: getNotificationsStatus,
      requestPermission: requestNotifications,
    },
    contacts: {
      kind: 'contacts',
      label: 'Contacts',
      description: 'Used for contact lookup in agent tasks.',
      icon: Users,
      applicableLevels: ['denied', 'ask_each_time', 'allow_while_using'],
      getStatus: getContactsStatus,
      requestPermission: requestContacts,
    },
  });

/** Ordered list for display on the permissions index screen. */
export const PERMISSION_KINDS: MobilePermissionKind[] = [
  'microphone',
  'camera',
  'location',
  'photos',
  'notifications',
  'contacts',
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
