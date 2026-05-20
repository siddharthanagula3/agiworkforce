/**
 * Centralized localStorage key registry.
 *
 * FIX (audit 2026-05-20, §14): hardcoded literal keys spread across stores
 * (`'id-mappings'`, `'computerUse.model'`, etc.) silently drift on refactor.
 * `logoutCleanup.ts` is the canonical example: 60+ inline `removeItem` calls
 * with hardcoded strings, no central registry, so a misspell or partial
 * cleanup goes unnoticed.
 *
 * Adopt these constants when touching the surrounding code. Do NOT add new
 * literal keys — extend this registry instead.
 */
export const STORAGE_KEYS = {
  /** Chat store: bidirectional UUID ↔ DB-row-id mapping used by chatStore. */
  ID_MAPPINGS: 'id-mappings',
  /** Computer-use store: persisted model picked in ComputerUseSettings. */
  COMPUTER_USE_MODEL: 'computerUse.model',
  /** Computer-use store: persisted provider picked in ComputerUseSettings. */
  COMPUTER_USE_PROVIDER: 'computerUse.provider',
  /** Scheduler store: queue of scheduled tasks. */
  SCHEDULER_TASKS: 'scheduler.tasks',
  /** Command palette: rolling list of recent search queries. */
  RECENT_SEARCHES: 'command-palette.recent-searches',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
