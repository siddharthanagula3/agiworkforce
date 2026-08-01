/**
 * Mobile OS Permission types
 *
 * Canonical enum for Mobile permission kinds.
 * Extraction to packages/contracts/types is deferred — no other surface needs this today
 * (v1 LOCAL ONLY; no cross-surface cloud sync of permission state).
 *
 * Permission levels follow the Apple/Android 4-state model. Not every kind
 * supports all four levels; see APPLICABLE_LEVELS in registry.ts.
 */

/**
 * Permission kinds known to Mobile. Every kind here is backed by an installed
 * native adapter and rendered in the settings list.
 *
 * `location` used to sit here with stub adapters that hard-returned
 * 'undetermined' (no `expo-location` dependency) and was excluded from
 * PERMISSION_KINDS, so it could never render. A half-wired permission in the
 * type registry is worse than none — it invites callers to read a level the OS
 * was never asked for — so it was removed. Re-adding location means adding the
 * dependency and a real adapter together, never the type alone.
 */
export type MobilePermissionKind =
  | 'microphone'
  | 'camera'
  | 'photos'
  | 'notifications'
  | 'contacts'
  | 'calendar'
  | 'reminders';

/**
 * The canonical 4-state Apple/Android permission level enum.
 *
 * - denied:              The user has explicitly denied or has never been asked.
 * - ask_each_time:       The OS will prompt the user on each access attempt.
 * - allow_while_using:   Access granted only while the app is in the foreground.
 * - allow_always:        Unconditional background + foreground access.
 *
 * Not all permissions support all four levels. See `APPLICABLE_LEVELS` in
 * registry.ts for the per-kind subset.
 */
export type MobilePermissionLevel =
  | 'denied'
  | 'ask_each_time'
  | 'allow_while_using'
  | 'allow_always';

/**
 * Runtime OS permission status — returned by Expo permission APIs.
 * Maps to the union of PermissionStatus values across expo-* packages.
 */
export type OsPermissionStatus = 'undetermined' | 'granted' | 'denied';

/**
 * The shape stored in MMKV (per permission).
 * - lastObservedStatus: the OS status at the last screen mount.
 * - userIntent:         what level the user last explicitly requested.
 */
export interface StoredPermissionState {
  lastObservedStatus: OsPermissionStatus;
  userIntent: MobilePermissionLevel;
}

/** Display label for each level shown in the enum picker. */
export const LEVEL_LABELS: Readonly<Record<MobilePermissionLevel, string>> = Object.freeze({
  denied: 'Never',
  ask_each_time: 'Ask each time',
  allow_while_using: 'While using the app',
  allow_always: 'Always',
});

/**
 * Compact label naming the level a permission is actually at, for the trailing
 * slot of the permissions list and its accessibility label.
 *
 * The list used to collapse every kind to On / Ask / Off, which threw away the
 * distinction the registry already models: "granted" means foreground-only for
 * the microphone and unconditional for notifications, and those are different
 * grants. Naming the level turns the list into an audit view.
 *
 * A kind whose grant is not honestly described by these words overrides them
 * per level via `PermissionRegistryEntry.levelLabels` (see registry.ts).
 */
export const LEVEL_STATUS_LABELS: Readonly<Record<MobilePermissionLevel, string>> = Object.freeze({
  denied: 'Never',
  ask_each_time: 'Ask',
  allow_while_using: 'While using',
  allow_always: 'Always',
});

/** Short description shown below each level option. */
export const LEVEL_DESCRIPTIONS: Readonly<Record<MobilePermissionLevel, string>> = Object.freeze({
  denied: 'App cannot access this permission.',
  ask_each_time: 'The OS will ask each time the app needs access.',
  allow_while_using: 'Access is granted only while the app is in the foreground.',
  allow_always: 'Access is granted in foreground and background.',
});
