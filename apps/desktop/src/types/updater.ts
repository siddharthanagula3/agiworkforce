/**
 * Application auto-updater types.
 *
 * These types correspond to the Rust types in `src-tauri/src/features/updater.rs`
 * and are used for type-safe communication with the Tauri backend.
 */

/**
 * Information about an available update.
 */
export interface UpdateInfo {
  /** The new version string (e.g., "1.2.0") */
  version: string;
  /** Release notes or changelog (may be empty) */
  body: string | null;
  /** Release date in ISO 8601 format */
  date: string | null;
  /** Download URL for the update */
  download_url: string | null;
}

/**
 * Result of checking for updates.
 * Discriminated union based on the `status` field.
 */
export type UpdateCheckResult =
  | { status: 'available'; info: UpdateInfo }
  | { status: 'up_to_date'; current_version: string }
  | { status: 'error'; message: string };

/**
 * Progress information during update download.
 */
export interface UpdateProgress {
  /** Bytes downloaded so far */
  downloaded: number;
  /** Total bytes to download (if known) */
  total: number | null;
  /** Download progress as percentage (0-100) */
  percentage: number | null;
}

/**
 * Status of the update process.
 */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'pending_restart'
  | 'error';

/**
 * Event payload for updater events.
 * Emitted during the update process for UI updates.
 */
export interface UpdaterEvent {
  /** Current status of the update process */
  status: UpdateStatus;
  /** Progress information (if downloading) */
  progress: UpdateProgress | null;
  /** Update info (if available) */
  info: UpdateInfo | null;
  /** Error message (if error occurred) */
  error: string | null;
}

/**
 * Detailed version information about the application.
 */
export interface VersionInfo {
  /** Application version (e.g., "1.2.0") */
  version: string;
  /** Application name */
  name: string;
  /** Tauri version */
  tauri_version: string;
}

/**
 * Updater event names for listening to update progress.
 */
export type UpdaterEventName =
  | 'updater:checking'
  | 'updater:available'
  | 'updater:not-available'
  | 'updater:downloading'
  | 'updater:downloaded'
  | 'updater:installing'
  | 'updater:installed'
  | 'updater:error';

/**
 * Type guard to check if update is available.
 */
export function isUpdateAvailable(
  result: UpdateCheckResult,
): result is { status: 'available'; info: UpdateInfo } {
  return result.status === 'available';
}

/**
 * Type guard to check if app is up to date.
 */
export function isUpToDate(
  result: UpdateCheckResult,
): result is { status: 'up_to_date'; current_version: string } {
  return result.status === 'up_to_date';
}

/**
 * Type guard to check if update check resulted in error.
 */
export function isUpdateError(
  result: UpdateCheckResult,
): result is { status: 'error'; message: string } {
  return result.status === 'error';
}

/**
 * Updater command names for invoking Tauri commands.
 */
export const UPDATER_COMMANDS = {
  CHECK_FOR_UPDATES: 'check_for_updates',
  INSTALL_UPDATE: 'install_update',
  INSTALL_UPDATE_AND_RESTART: 'install_update_and_restart',
  GET_CURRENT_VERSION: 'get_current_version',
  GET_VERSION_INFO: 'get_version_info',
} as const;

/**
 * Updater event names for Tauri event listening.
 */
export const UPDATER_EVENTS = {
  CHECKING: 'updater:checking',
  AVAILABLE: 'updater:available',
  NOT_AVAILABLE: 'updater:not-available',
  DOWNLOADING: 'updater:downloading',
  DOWNLOADED: 'updater:downloaded',
  INSTALLING: 'updater:installing',
  INSTALLED: 'updater:installed',
  ERROR: 'updater:error',
} as const;
