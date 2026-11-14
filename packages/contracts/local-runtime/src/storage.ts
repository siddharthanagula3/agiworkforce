export const STORAGE_READ_COMMAND = 'desktop_storage_read';
export const STORAGE_CLEAN_COMMAND = 'desktop_storage_clean';

export const STORAGE_COMMANDS = [STORAGE_READ_COMMAND, STORAGE_CLEAN_COMMAND] as const;

export const STORAGE_CATEGORIES = [
  'sessions',
  'worktrees',
  'web-cache',
  'logs',
  'caches',
  'app-data',
] as const;

export type StorageCategory = (typeof STORAGE_CATEGORIES)[number];

export const STORAGE_CLEANUPS = [
  'web-cache',
  'old-logs',
  'shell-scratch',
  'archived-sessions',
] as const;

export type StorageCleanup = (typeof STORAGE_CLEANUPS)[number];

export function isStorageCleanup(value: unknown): value is StorageCleanup {
  return (STORAGE_CLEANUPS as readonly unknown[]).includes(value);
}

export const OLD_LOG_AGE_DAYS = 7;

export const OLD_ARCHIVE_AGE_DAYS = 30;

export interface StorageCategoryUsage {
  category: StorageCategory;
  bytes: number;
  /** The walk stopped at its entry limit, so the real size is at least `bytes`. */
  partial: boolean;
}

export interface StorageUsage {
  categories: StorageCategoryUsage[];
  totalBytes: number;
  /** The folder the CLI keeps sessions, worktrees and caches in. */
  dataPath: string;
  measuredAtMs: number;
}
