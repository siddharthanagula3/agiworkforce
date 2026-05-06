/**
 * Trigger Store — state management for event-triggered agent automation.
 *
 * Wires the trigger CRUD Tauri commands:
 *   list_triggers, register_trigger, unregister_trigger, toggle_trigger,
 *   get_trigger_executions
 *
 * All invoke() params are camelCase per Tauri IPC rules.
 */
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';

// ── Types ────────────────────────────────────────────────────────────────────
//
// TODO(types-agent): These local type definitions diverge from the canonical
// contracts in `@agiworkforce/types` (`EventTriggerDefinition`, `TriggerExecution`,
// `TriggerConfig`, `TriggerAction`, `TriggerType`). This store should be
// refactored to import from `@agiworkforce/types` and remove the duplicates.
//
// Key divergences to resolve before that refactor:
//   1. Timestamp format: this store uses Unix epoch milliseconds (`number`),
//      while `@agiworkforce/types` uses ISO 8601 strings (`string`).
//      Align on ISO 8601 — convert at the Tauri IPC boundary if needed.
//   2. `TriggerType` here omits 'slack' | 'github' | 'linear' variants.
//   3. `TriggerExecutionStatus` uses 'success' here vs 'completed' in the
//      canonical `TriggerExecution.status` union.
//   4. `TriggerAction` here omits the `type` discriminant ('agent' | 'workflow'
//      | 'notification') and the optional `workflowId` field.

export type TriggerType = 'cron' | 'webhook' | 'file_watcher';

export type TriggerExecutionStatus = 'success' | 'failed' | 'running';

export interface CronConfig {
  expression: string;
}

export interface WebhookConfig {
  path: string;
  authEnabled: boolean;
}

export interface FileWatcherConfig {
  directory: string;
  globPattern: string;
  debounceMs: number;
}

export type TriggerConfig = CronConfig | WebhookConfig | FileWatcherConfig;

export interface TriggerAction {
  prompt: string;
  model: string;
  approvalRequired: boolean;
}

export interface EventTriggerDefinition {
  id: string;
  name: string;
  type: TriggerType;
  enabled: boolean;
  config: TriggerConfig;
  action: TriggerAction;
  createdAt: number;
  updatedAt: number;
  triggerCount: number;
  lastTriggeredAt: number | null;
}

export interface TriggerExecution {
  id: string;
  triggerId: string;
  status: TriggerExecutionStatus;
  startedAt: number;
  completedAt: number | null;
  durationMs: number | null;
  resultPreview: string | null;
  error: string | null;
}

export type CreateTriggerInput = Omit<
  EventTriggerDefinition,
  'id' | 'createdAt' | 'updatedAt' | 'triggerCount' | 'lastTriggeredAt'
>;

// ── IPC Conversion Shims ──────────────────────────────────────────────────────
//
// Rust serializes timestamps as ISO 8601 strings and execution status as
// 'completed' (canonical type).  This store uses Unix epoch milliseconds and
// 'success' internally.  The shims below normalize at the IPC boundary so the
// store internals remain consistent.
//
// TODO(types-agent): Once @agiworkforce/types EventTriggerDefinition and
// TriggerExecution are adopted here, remove these shims and import from the
// package directly.

/** Normalize a timestamp that may be ISO 8601 (from Rust) or already a number. */
function normalizeTimestamp(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw;
  // ISO 8601 → Unix epoch ms
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/** Normalize execution status: Rust sends 'completed', store expects 'success'. */
function normalizeExecutionStatus(raw: string): TriggerExecutionStatus {
  if (raw === 'completed') return 'success';
  if (raw === 'success' || raw === 'failed' || raw === 'running') {
    return raw as TriggerExecutionStatus;
  }
  return 'failed';
}

/** Normalize a raw IPC trigger response to the store's EventTriggerDefinition shape. */
function normalizeTrigger(raw: Record<string, unknown>): EventTriggerDefinition {
  return {
    ...(raw as unknown as EventTriggerDefinition),
    createdAt: normalizeTimestamp(raw['createdAt'] as string | number) ?? Date.now(),
    updatedAt: normalizeTimestamp(raw['updatedAt'] as string | number) ?? Date.now(),
    lastTriggeredAt: normalizeTimestamp(raw['lastTriggeredAt'] as string | number | null),
  };
}

/** Normalize a raw IPC execution response to the store's TriggerExecution shape. */
function normalizeExecution(raw: Record<string, unknown>): TriggerExecution {
  return {
    ...(raw as unknown as TriggerExecution),
    status: normalizeExecutionStatus(raw['status'] as string),
    startedAt: normalizeTimestamp(raw['startedAt'] as string | number) ?? Date.now(),
    completedAt: normalizeTimestamp(raw['completedAt'] as string | number | null),
  };
}

// ── Store ────────────────────────────────────────────────────────────────────

interface TriggerState {
  triggers: EventTriggerDefinition[];
  executions: Record<string, TriggerExecution[]>;
  loading: boolean;
  error: string | null;

  fetchTriggers: () => Promise<void>;
  createTrigger: (trigger: CreateTriggerInput) => Promise<void>;
  updateTrigger: (id: string, updates: Partial<EventTriggerDefinition>) => Promise<void>;
  deleteTrigger: (id: string) => Promise<void>;
  toggleTrigger: (id: string, enabled: boolean) => Promise<void>;
  fetchExecutions: (triggerId: string) => Promise<void>;
}

export const useTriggerStore = create<TriggerState>()(
  devtools(
    persist(
      immer((set, _get) => ({
        triggers: [],
        executions: {},
        loading: false,
        error: null,

        fetchTriggers: async () => {
          set(
            (state) => {
              state.loading = true;
              state.error = null;
            },
            undefined,
            'trigger/fetchTriggers/start',
          );
          try {
            const rawTriggers = await invoke<Record<string, unknown>[]>('list_triggers');
            const triggers = rawTriggers.map(normalizeTrigger);
            set(
              (state) => {
                state.triggers = triggers;
                state.loading = false;
              },
              undefined,
              'trigger/fetchTriggers/success',
            );
          } catch (err) {
            set(
              (state) => {
                state.error = err instanceof Error ? err.message : 'Failed to fetch triggers';
                state.loading = false;
              },
              undefined,
              'trigger/fetchTriggers/error',
            );
          }
        },

        createTrigger: async (trigger) => {
          set(
            (state) => {
              state.loading = true;
              state.error = null;
            },
            undefined,
            'trigger/createTrigger/start',
          );
          try {
            const rawCreated = await invoke<Record<string, unknown>>('register_trigger', {
              trigger,
            });
            const created = normalizeTrigger(rawCreated);
            set(
              (state) => {
                state.triggers.unshift(created);
                state.loading = false;
              },
              undefined,
              'trigger/createTrigger/success',
            );
          } catch (err) {
            set(
              (state) => {
                state.error = err instanceof Error ? err.message : 'Failed to create trigger';
                state.loading = false;
              },
              undefined,
              'trigger/createTrigger/error',
            );
            throw err;
          }
        },

        updateTrigger: async (id, updates) => {
          try {
            await invoke('update_trigger', { triggerId: id, updates });
            set(
              (state) => {
                const idx = state.triggers.findIndex((t) => t.id === id);
                if (idx >= 0) {
                  Object.assign(state.triggers[idx]!, { ...updates, updatedAt: Date.now() });
                }
              },
              undefined,
              'trigger/updateTrigger/success',
            );
          } catch (err) {
            set(
              (state) => {
                state.error = err instanceof Error ? err.message : 'Failed to update trigger';
              },
              undefined,
              'trigger/updateTrigger/error',
            );
            throw err;
          }
        },

        deleteTrigger: async (id) => {
          try {
            await invoke('unregister_trigger', { triggerId: id });
          } catch (err) {
            // log but still remove locally so UI stays consistent
            console.error('[triggerStore] Failed to unregister trigger on backend:', err);
          }
          set(
            (state) => {
              const idx = state.triggers.findIndex((t) => t.id === id);
              if (idx >= 0) {
                state.triggers.splice(idx, 1);
              }
              delete state.executions[id];
            },
            undefined,
            'trigger/deleteTrigger',
          );
        },

        toggleTrigger: async (id, enabled) => {
          // Optimistic update
          set(
            (state) => {
              const trig = state.triggers.find((t) => t.id === id);
              if (trig) {
                trig.enabled = enabled;
                trig.updatedAt = Date.now();
              }
            },
            undefined,
            'trigger/toggleTrigger/optimistic',
          );
          try {
            await invoke('toggle_trigger', { triggerId: id, enabled });
          } catch (err) {
            // Roll back
            set(
              (state) => {
                const trig = state.triggers.find((t) => t.id === id);
                if (trig) {
                  trig.enabled = !enabled;
                }
                state.error = err instanceof Error ? err.message : 'Failed to toggle trigger';
              },
              undefined,
              'trigger/toggleTrigger/rollback',
            );
          }
        },

        fetchExecutions: async (triggerId) => {
          try {
            const rawExecutions = await invoke<Record<string, unknown>[]>(
              'get_trigger_executions',
              {
                triggerId,
              },
            );
            const executions = rawExecutions.map(normalizeExecution);
            set(
              (state) => {
                state.executions[triggerId] = executions;
              },
              undefined,
              'trigger/fetchExecutions/success',
            );
          } catch {
            // non-fatal — execution log is supplementary
          }
        },
      })),
      {
        name: 'trigger-store',
        // Only persist the trigger definitions, not transient loading/error state
        partialize: (state) => ({ triggers: state.triggers }),
      },
    ),
    { name: 'TriggerStore', enabled: import.meta.env.DEV },
  ),
);
