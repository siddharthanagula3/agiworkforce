import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@/lib/tauri-mock';
import { storageFallback } from '@/lib/storageFallback';

export type AgentMode = 'safe' | 'plan' | 'build' | 'autopilot';

export interface ChatPreferences {
  promptCompletionEnabled: boolean;
  alwaysUseAgentMode: boolean;
  compactMode: boolean;
  autoApproveTools: boolean;
  autoInjectSkills?: boolean;
  autoSaveMemories?: boolean;
  agentMode: AgentMode;
  chatStorageMode: 'local' | 'cloud';
  autoTTS?: boolean;
}

interface ChatPreferencesState {
  chatPreferences: ChatPreferences;
  lastInputWasVoice: boolean;
}

interface ChatPreferencesActions {
  setPromptCompletionEnabled: (enabled: boolean) => void;
  setAlwaysUseAgentMode: (enabled: boolean) => void;
  setCompactMode: (enabled: boolean) => void;
  setAutoInjectSkills: (enabled: boolean) => void;
  setAutoApproveTools: (enabled: boolean) => Promise<void>;
  setChatAgentMode: (mode: AgentMode) => Promise<void>;
  setAutoTTS: (enabled: boolean) => void;
  setLastInputWasVoice: (wasVoice: boolean) => void;
}

export type ChatPreferencesStore = ChatPreferencesState & ChatPreferencesActions;

export const defaultChatPreferences: ChatPreferences = {
  promptCompletionEnabled: true,
  alwaysUseAgentMode: false,
  compactMode: true,
  autoApproveTools: false,
  autoInjectSkills: true,
  agentMode: 'build' as AgentMode,
  chatStorageMode: 'local',
  autoTTS: true,
};

export const useChatPreferencesStore = create<ChatPreferencesStore>()(
  devtools(
    persist(
      subscribeWithSelector((set) => ({
        chatPreferences: { ...defaultChatPreferences },
        lastInputWasVoice: false,
        setPromptCompletionEnabled: (enabled) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, promptCompletionEnabled: enabled },
            }),
            undefined,
            'chatPreferences/setPromptCompletionEnabled',
          );
        },
        setAlwaysUseAgentMode: (enabled) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, alwaysUseAgentMode: enabled },
            }),
            undefined,
            'chatPreferences/setAlwaysUseAgentMode',
          );
        },
        setCompactMode: (enabled) => {
          set(
            (state) => ({ chatPreferences: { ...state.chatPreferences, compactMode: enabled } }),
            undefined,
            'chatPreferences/setCompactMode',
          );
        },
        setAutoInjectSkills: (enabled) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, autoInjectSkills: enabled },
            }),
            undefined,
            'chatPreferences/setAutoInjectSkills',
          );
        },
        setAutoApproveTools: async (enabled) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, autoApproveTools: enabled },
            }),
            undefined,
            'chatPreferences/setAutoApproveTools',
          );
          try {
            await invoke('set_auto_approve_all', { enabled });
          } catch (error) {
            console.error('Failed to sync auto-approve-all to backend:', error);
          }
        },
        setChatAgentMode: async (mode) => {
          // Lazy import breaks potential circular dependency with settingsStore
          const { useSettingsStore } = await import('../settingsStore');
          await useSettingsStore.getState().setAgentMode(mode);
        },
        setAutoTTS: (enabled) => {
          set(
            (state) => ({ chatPreferences: { ...state.chatPreferences, autoTTS: enabled } }),
            undefined,
            'chatPreferences/setAutoTTS',
          );
        },
        setLastInputWasVoice: (wasVoice) => {
          set({ lastInputWasVoice: wasVoice }, undefined, 'chatPreferences/setLastInputWasVoice');
        },
      })),
      {
        name: 'agiworkforce-chat-preferences',
        version: 2,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        migrate: (persistedState: unknown, version: number) => {
          const state = persistedState as ChatPreferencesStore;
          if (version < 2)
            state.chatPreferences = {
              ...defaultChatPreferences,
              ...state.chatPreferences,
              autoTTS: true,
            };
          return state;
        },
        partialize: (state) => ({ chatPreferences: state.chatPreferences }),
      },
    ),
    { name: 'ChatPreferencesStore', enabled: import.meta.env.DEV },
  ),
);
