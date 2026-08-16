import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke, listen, isTauri } from '@/lib/tauri-mock';

export interface ThinkingConfigResponse {
  enabled: boolean;
  budget: string;
  budget_tokens: number;
  emit_thinking_events: boolean;
  include_thinking_summary: boolean;
}

export interface SetThinkingConfigRequest {
  enabled?: boolean;
  budget?: string;
  emitThinkingEvents?: boolean;
  includeThinkingSummary?: boolean;
}

export interface ThinkingContent {
  thinking: string;
  started_at: string;
  completed_at: string | null;
}

export interface ThinkingEvent {
  event_type: string;
  content: string | null;
  tokens: number | null;
  message_id: string | null;
}

interface ThinkingState {
  config: ThinkingConfigResponse | null;
  isConfigLoading: boolean;

  currentThinking: ThinkingContent | null;

  modelSupport: Record<string, boolean>;
}

interface ThinkingActions {
  loadConfig: () => Promise<ThinkingConfigResponse>;
  setConfig: (request: SetThinkingConfigRequest) => Promise<ThinkingConfigResponse>;

  toggle: () => Promise<boolean>;

  setBudget: (budget: string) => Promise<ThinkingConfigResponse>;

  detectTrigger: (message: string) => Promise<ThinkingConfigResponse>;

  checkModelSupport: (model: string) => Promise<boolean>;

  getCurrentThinking: () => Promise<ThinkingContent | null>;

  initialize: () => Promise<void>;
}

export const useThinkingStore = create<ThinkingState & ThinkingActions>()(
  devtools(
    immer((set, get) => ({
      config: null,
      isConfigLoading: false,
      currentThinking: null,
      modelSupport: {},

      loadConfig: async () => {
        if (!isTauri) {
          set((state) => {
            state.isConfigLoading = false;
          });
          return (
            get().config ?? {
              enabled: false,
              budget: 'medium',
              budget_tokens: 10000,
              emit_thinking_events: false,
              include_thinking_summary: false,
            }
          );
        }
        set((state) => {
          state.isConfigLoading = true;
        });

        try {
          const config = await invoke<ThinkingConfigResponse>('thinking_get_config');
          set((state) => {
            state.config = config;
            state.isConfigLoading = false;
          });
          return config;
        } catch (error) {
          console.error('Failed to load thinking config:', error);
          set((state) => {
            state.isConfigLoading = false;
          });
          throw error;
        }
      },

      setConfig: async (request: SetThinkingConfigRequest) => {
        if (!isTauri) {
          return (
            get().config ?? {
              enabled: false,
              budget: 'medium',
              budget_tokens: 10000,
              emit_thinking_events: false,
              include_thinking_summary: false,
            }
          );
        }
        try {
          const config = await invoke<ThinkingConfigResponse>('thinking_set_config', {
            request: {
              enabled: request.enabled,
              budget: request.budget,
              emit_thinking_events: request.emitThinkingEvents,
              include_thinking_summary: request.includeThinkingSummary,
            },
          });
          set((state) => {
            state.config = config;
          });
          return config;
        } catch (error) {
          console.error('Failed to set thinking config:', error);
          throw error;
        }
      },

      toggle: async () => {
        if (!isTauri) {
          const newEnabled = !(get().config?.enabled ?? false);
          set((state) => {
            if (state.config) state.config.enabled = newEnabled;
          });
          return newEnabled;
        }
        try {
          const enabled = await invoke<boolean>('thinking_toggle');
          set((state) => {
            if (state.config) {
              state.config.enabled = enabled;
            }
          });
          return enabled;
        } catch (error) {
          console.error('Failed to toggle thinking:', error);
          throw error;
        }
      },

      setBudget: async (budget: string) => {
        if (!isTauri) {
          return (
            get().config ?? {
              enabled: false,
              budget,
              budget_tokens: 10000,
              emit_thinking_events: false,
              include_thinking_summary: false,
            }
          );
        }
        try {
          const config = await invoke<ThinkingConfigResponse>('thinking_set_budget', { budget });
          set((state) => {
            state.config = config;
          });
          return config;
        } catch (error) {
          console.error('Failed to set thinking budget:', error);
          throw error;
        }
      },

      detectTrigger: async (message: string) => {
        if (!isTauri) {
          return (
            get().config ?? {
              enabled: false,
              budget: 'medium',
              budget_tokens: 10000,
              emit_thinking_events: false,
              include_thinking_summary: false,
            }
          );
        }
        try {
          const config = await invoke<ThinkingConfigResponse>('thinking_detect_trigger', {
            message,
          });
          return config;
        } catch (error) {
          console.error('Failed to detect thinking trigger:', error);
          throw error;
        }
      },

      checkModelSupport: async (model: string) => {
        if (!isTauri) return false;
        const cached = get().modelSupport[model];
        if (cached !== undefined) {
          return cached;
        }

        try {
          const supported = await invoke<boolean>('thinking_model_supports', { model });
          set((state) => {
            state.modelSupport[model] = supported;
          });
          return supported;
        } catch (error) {
          console.error('Failed to check model thinking support:', error);
          return false;
        }
      },

      getCurrentThinking: async () => {
        if (!isTauri) return get().currentThinking;
        try {
          const thinking = await invoke<ThinkingContent | null>('thinking_get_current');
          set((state) => {
            state.currentThinking = thinking;
          });
          return thinking;
        } catch (error) {
          console.error('Failed to get current thinking:', error);
          return null;
        }
      },

      initialize: async () => {
        if (!isTauri) return;

        await get().loadConfig();

        listen<ThinkingEvent>('thinking:event', (event) => {
          const payload = event.payload;
          if (payload.event_type === 'start') {
            set((state) => {
              state.currentThinking = {
                thinking: '',
                started_at: new Date().toISOString(),
                completed_at: null,
              };
            });
          } else if (payload.event_type === 'delta' && payload.content) {
            set((state) => {
              if (state.currentThinking) {
                state.currentThinking.thinking += payload.content;
              }
            });
          } else if (payload.event_type === 'complete') {
            set((state) => {
              if (state.currentThinking) {
                state.currentThinking.completed_at = new Date().toISOString();
                if (payload.content) {
                  state.currentThinking.thinking = payload.content;
                }
              }
            });
          }
        });
      },
    })),
    { name: 'ThinkingStore', enabled: import.meta.env.DEV },
  ),
);

export const selectThinkingConfig = (state: ThinkingState) => state.config;
export const selectIsThinkingEnabled = (state: ThinkingState) => state.config?.enabled ?? false;
export const selectThinkingBudget = (state: ThinkingState) => state.config?.budget ?? 'medium';
export const selectCurrentThinking = (state: ThinkingState) => state.currentThinking;

export default useThinkingStore;
