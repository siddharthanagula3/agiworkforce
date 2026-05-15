import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer as thinkingImmer } from 'zustand/middleware/immer';
import { invoke, listen as thinkingListen, isTauri as isTauriThinking } from '@/lib/tauri-mock';

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

interface ThinkingStateShape {
  config: ThinkingConfigResponse | null;
  isConfigLoading: boolean;
  currentThinking: ThinkingContent | null;
  modelSupport: Record<string, boolean>;
}

interface ThinkingActionsShape {
  loadConfig: () => Promise<ThinkingConfigResponse>;
  setConfig: (request: SetThinkingConfigRequest) => Promise<ThinkingConfigResponse>;
  toggle: () => Promise<boolean>;
  setBudget: (budget: string) => Promise<ThinkingConfigResponse>;
  detectTrigger: (message: string) => Promise<ThinkingConfigResponse>;
  checkModelSupport: (model: string) => Promise<boolean>;
  getCurrentThinking: () => Promise<ThinkingContent | null>;
  initialize: () => Promise<void>;
}

export const useThinkingStore = create<ThinkingStateShape & ThinkingActionsShape>()(
  devtools(
    thinkingImmer((set, get) => ({
      config: null,
      isConfigLoading: false,
      currentThinking: null,
      modelSupport: {},

      loadConfig: async () => {
        if (!isTauriThinking) {
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
          const config = (await invoke('thinking_get_config')) as ThinkingConfigResponse;
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

      setConfig: async (request) => {
        if (!isTauriThinking)
          return (
            get().config ?? {
              enabled: false,
              budget: 'medium',
              budget_tokens: 10000,
              emit_thinking_events: false,
              include_thinking_summary: false,
            }
          );
        try {
          const config = (await invoke('thinking_set_config', {
            request: {
              enabled: request.enabled,
              budget: request.budget,
              emit_thinking_events: request.emitThinkingEvents,
              include_thinking_summary: request.includeThinkingSummary,
            },
          })) as ThinkingConfigResponse;
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
        if (!isTauriThinking) {
          const newEnabled = !(get().config?.enabled ?? false);
          set((state) => {
            if (state.config) state.config.enabled = newEnabled;
          });
          return newEnabled;
        }
        try {
          const enabled = (await invoke('thinking_toggle')) as boolean;
          set((state) => {
            if (state.config) state.config.enabled = enabled;
          });
          return enabled;
        } catch (error) {
          console.error('Failed to toggle thinking:', error);
          throw error;
        }
      },

      setBudget: async (budget) => {
        if (!isTauriThinking)
          return (
            get().config ?? {
              enabled: false,
              budget,
              budget_tokens: 10000,
              emit_thinking_events: false,
              include_thinking_summary: false,
            }
          );
        try {
          const config = (await invoke('thinking_set_budget', {
            budget,
          })) as ThinkingConfigResponse;
          set((state) => {
            state.config = config;
          });
          return config;
        } catch (error) {
          console.error('Failed to set thinking budget:', error);
          throw error;
        }
      },

      detectTrigger: async (message) => {
        if (!isTauriThinking)
          return (
            get().config ?? {
              enabled: false,
              budget: 'medium',
              budget_tokens: 10000,
              emit_thinking_events: false,
              include_thinking_summary: false,
            }
          );
        try {
          return (await invoke('thinking_detect_trigger', { message })) as ThinkingConfigResponse;
        } catch (error) {
          console.error('Failed to detect thinking trigger:', error);
          throw error;
        }
      },

      checkModelSupport: async (model) => {
        if (!isTauriThinking) return false;
        const cached = get().modelSupport[model];
        if (cached !== undefined) return cached;
        try {
          const supported = (await invoke('thinking_model_supports', { model })) as boolean;
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
        if (!isTauriThinking) return get().currentThinking;
        try {
          const thinking = (await invoke('thinking_get_current')) as ThinkingContent | null;
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
        if (!isTauriThinking) return;
        await get().loadConfig();
        thinkingListen<ThinkingEvent>('thinking:event', (event) => {
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
              if (state.currentThinking) state.currentThinking.thinking += payload.content ?? '';
            });
          } else if (payload.event_type === 'complete') {
            set((state) => {
              if (state.currentThinking) {
                state.currentThinking.completed_at = new Date().toISOString();
                if (payload.content) state.currentThinking.thinking = payload.content;
              }
            });
          }
        });
      },
    })),
    { name: 'ThinkingStore', enabled: import.meta.env.DEV },
  ),
);

export const selectThinkingConfig = (state: ThinkingStateShape) => state.config;
export const selectIsThinkingEnabled = (state: ThinkingStateShape) =>
  state.config?.enabled ?? false;
export const selectThinkingBudget = (state: ThinkingStateShape) => state.config?.budget ?? 'medium';
export const selectCurrentThinking = (state: ThinkingStateShape) => state.currentThinking;
