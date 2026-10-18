import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';

export type TriggerType = 'cron' | 'webhook' | 'file_watcher';

export const TRIGGER_RUN_OUTCOMES = [
  'queued',
  'running',
  'waiting',
  'finished',
  'failed',
  'cancelled',
  'taken_over',
] as const;

export type TriggerRunOutcome = (typeof TRIGGER_RUN_OUTCOMES)[number];

export interface CronConfig {
  type: 'cron';
  expression: string;
  timezone?: string | null;
}

export interface WebhookConfig {
  type: 'webhook';
  path: string;
  tokenHash?: string | null;
}

export interface FileWatcherConfig {
  type: 'fileWatcher';
  watchPath: string;
  glob?: string | null;
  debounceMs?: number | null;
  folderApproved?: boolean;
}

export type TriggerConfig = CronConfig | WebhookConfig | FileWatcherConfig;

export type TriggerActionType = 'agent' | 'notification';

export interface TriggerAction {
  type: TriggerActionType;
  prompt?: string | null;
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
  coalescedCount: number;
  problem: string | null;
  webhookUrl: string | null;
  runLive: boolean;
}

export interface TriggerEngineInfo {
  minStartIntervalSecs: number;
  webhookBaseUrl: string;
  webhookListening: boolean;
  webhookProblem: string | null;
  maxWebhookBodyBytes: number;
  idempotencyWindowSecs: number;
}

export interface CreatedTrigger {
  trigger: EventTriggerDefinition;
  token: string | null;
}

export interface TriggerExecution {
  id: string;
  triggerId: string;
  started: boolean;
  firedAt: number;
  error: string | null;
  missedStarts: number;
  outcome: TriggerRunOutcome | null;
}

export type CreateTriggerInput = Omit<
  EventTriggerDefinition,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'triggerCount'
  | 'lastTriggeredAt'
  | 'coalescedCount'
  | 'problem'
  | 'webhookUrl'
  | 'runLive'
>;

function normalizeTimestamp(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

function normalizeAction(raw: unknown): TriggerAction {
  const action = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    type: action['type'] === 'notification' ? 'notification' : 'agent',
    prompt: typeof action['prompt'] === 'string' ? action['prompt'] : null,
    approvalRequired: action['approvalRequired'] === true,
  };
}

function normalizeTrigger(raw: Record<string, unknown>): EventTriggerDefinition {
  return {
    ...(raw as unknown as EventTriggerDefinition),
    action: normalizeAction(raw['action']),
    createdAt: normalizeTimestamp(raw['createdAt'] as string | number) ?? Date.now(),
    updatedAt: normalizeTimestamp(raw['updatedAt'] as string | number) ?? Date.now(),
    lastTriggeredAt: normalizeTimestamp(raw['lastTriggeredAt'] as string | number | null),
    coalescedCount: typeof raw['coalescedCount'] === 'number' ? raw['coalescedCount'] : 0,
    problem: typeof raw['problem'] === 'string' ? raw['problem'] : null,
    webhookUrl: typeof raw['webhookUrl'] === 'string' ? raw['webhookUrl'] : null,
    runLive: raw['runLive'] === true,
  };
}

function normalizeEngineInfo(raw: unknown): TriggerEngineInfo | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const info = raw as Record<string, unknown>;
  const { minStartIntervalSecs, webhookBaseUrl, maxWebhookBodyBytes, idempotencyWindowSecs } = info;
  if (
    typeof minStartIntervalSecs !== 'number' ||
    typeof webhookBaseUrl !== 'string' ||
    typeof maxWebhookBodyBytes !== 'number' ||
    typeof idempotencyWindowSecs !== 'number'
  ) {
    return null;
  }
  return {
    minStartIntervalSecs,
    webhookBaseUrl,
    webhookListening: info['webhookListening'] === true,
    webhookProblem: typeof info['webhookProblem'] === 'string' ? info['webhookProblem'] : null,
    maxWebhookBodyBytes,
    idempotencyWindowSecs,
  };
}

async function listTriggers(): Promise<EventTriggerDefinition[]> {
  const rawTriggers = await invoke<Record<string, unknown>[]>('list_triggers');
  return rawTriggers.map((raw) => takeWebhookToken(raw).trigger);
}

function takeWebhookToken(raw: Record<string, unknown>): {
  trigger: EventTriggerDefinition;
  token: string | null;
} {
  const config = raw['config'];
  if (!config || typeof config !== 'object' || !('authToken' in config)) {
    return { trigger: normalizeTrigger(raw), token: null };
  }
  const { authToken, ...storedConfig } = config as Record<string, unknown>;
  return {
    trigger: normalizeTrigger({ ...raw, config: storedConfig }),
    token: typeof authToken === 'string' && authToken.length > 0 ? authToken : null,
  };
}

export function webhookNeedsToken(trigger: EventTriggerDefinition): boolean {
  return trigger.config.type === 'webhook' && !trigger.config.tokenHash;
}

function normalizeExecution(raw: Record<string, unknown>): TriggerExecution {
  const missedStarts = raw['missedStarts'];
  const outcome = TRIGGER_RUN_OUTCOMES.find((known) => known === raw['runOutcome']);
  return {
    id: String(raw['id']),
    triggerId: String(raw['triggerId']),
    started: raw['success'] === true,
    firedAt: normalizeTimestamp(raw['firedAt'] as string | number) ?? Date.now(),
    error: typeof raw['error'] === 'string' ? raw['error'] : null,
    missedStarts: typeof missedStarts === 'number' ? missedStarts : 0,
    outcome: outcome ?? null,
  };
}

interface TriggerState {
  triggers: EventTriggerDefinition[];
  executions: Record<string, TriggerExecution[]>;
  engineInfo: TriggerEngineInfo | null;
  loading: boolean;
  error: string | null;

  fetchTriggers: () => Promise<void>;
  fetchEngineInfo: () => Promise<void>;
  pickWatchFolder: () => Promise<string | null>;
  createTrigger: (trigger: CreateTriggerInput) => Promise<CreatedTrigger>;
  regenerateWebhookToken: (id: string) => Promise<string>;
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
        engineInfo: null,
        loading: false,
        error: null,

        fetchEngineInfo: async () => {
          try {
            const info = normalizeEngineInfo(await invoke<unknown>('trigger_engine_info'));
            set(
              (state) => {
                state.engineInfo = info;
              },
              undefined,
              'trigger/fetchEngineInfo/success',
            );
          } catch {
            return;
          }
        },

        pickWatchFolder: async () => {
          const picked = await invoke<string | null>('pick_trigger_watch_folder');
          return typeof picked === 'string' && picked.length > 0 ? picked : null;
        },

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
            const triggers = await listTriggers();
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
            const created = takeWebhookToken(rawCreated);
            set(
              (state) => {
                state.triggers.unshift(created.trigger);
                state.loading = false;
              },
              undefined,
              'trigger/createTrigger/success',
            );
            return created;
          } catch (err) {
            set(
              (state) => {
                state.loading = false;
              },
              undefined,
              'trigger/createTrigger/error',
            );
            throw err;
          }
        },

        regenerateWebhookToken: async (id) => {
          const rawUpdated = await invoke<Record<string, unknown>>('regenerate_webhook_token', {
            triggerId: id,
          });
          const { trigger: updated, token } = takeWebhookToken(rawUpdated);
          if (!token) {
            throw new Error('The new token was not returned. Generate it again.');
          }
          set(
            (state) => {
              const idx = state.triggers.findIndex((t) => t.id === id);
              if (idx >= 0) {
                state.triggers[idx] = updated;
              }
            },
            undefined,
            'trigger/regenerateWebhookToken/success',
          );
          return token;
        },

        updateTrigger: async (id, updates) => {
          const rawSaved = await invoke<Record<string, unknown>>('update_trigger', {
            triggerId: id,
            updates: {
              name: updates.name,
              enabled: updates.enabled,
              config: updates.config,
              action: updates.action,
            },
          });
          const saved = takeWebhookToken(rawSaved).trigger;
          set(
            (state) => {
              const idx = state.triggers.findIndex((t) => t.id === id);
              if (idx >= 0) {
                state.triggers[idx] = saved;
              }
            },
            undefined,
            'trigger/updateTrigger/success',
          );
        },

        deleteTrigger: async (id) => {
          try {
            await invoke('unregister_trigger', { triggerId: id });
          } catch (err) {
            const listed = await listTriggers().catch(() => null);
            if (listed) {
              set(
                (state) => {
                  state.triggers = listed;
                },
                undefined,
                'trigger/deleteTrigger/relisted',
              );
            }
            throw err;
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
            set(
              (state) => {
                const trig = state.triggers.find((t) => t.id === id);
                if (trig) {
                  trig.enabled = !enabled;
                }
                state.error =
                  err instanceof Error
                    ? err.message
                    : typeof err === 'string'
                      ? err
                      : 'Failed to toggle trigger';
              },
              undefined,
              'trigger/toggleTrigger/rollback',
            );
            const listed = await listTriggers().catch(() => null);
            if (listed) {
              set(
                (state) => {
                  state.triggers = listed;
                },
                undefined,
                'trigger/toggleTrigger/relisted',
              );
            }
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
            return;
          }
        },
      })),
      {
        name: 'trigger-store',
        partialize: (state) => ({ triggers: state.triggers }),
      },
    ),
    { name: 'TriggerStore', enabled: import.meta.env.DEV },
  ),
);
