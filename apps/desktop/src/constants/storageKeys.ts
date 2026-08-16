export const STORAGE_KEYS = {
  ID_MAPPINGS: 'id-mappings',
  COMPUTER_USE_MODEL: 'computerUse.model',
  COMPUTER_USE_PROVIDER: 'computerUse.provider',
  SCHEDULER_TASKS: 'scheduler.tasks',
  RECENT_SEARCHES: 'command-palette.recent-searches',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
