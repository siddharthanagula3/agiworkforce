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
            const triggers = await invoke<EventTriggerDefinition[]>('list_triggers');
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
            const created = await invoke<EventTriggerDefinition>('register_trigger', { trigger });
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
            const executions = await invoke<TriggerExecution[]>('get_trigger_executions', {
              triggerId,
            });
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
