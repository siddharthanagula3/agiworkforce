// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { invoke, isTauriContext } from '../lib/tauri-mock';
import { storageFallback } from '../lib/storageFallback';

export interface CustomInstructionsState {
  globalInstructions: string;

  projectInstructions: string;

  globalInstructionsEnabled: boolean;

  projectInstructionsEnabled: boolean;

  maxInstructionsLength: number;

  setGlobalInstructions: (instructions: string) => void;

  setProjectInstructions: (instructions: string) => void;

  setGlobalInstructionsEnabled: (enabled: boolean) => void;

  setProjectInstructionsEnabled: (enabled: boolean) => void;

  clearAllInstructions: () => void;

  saveToBackend: () => Promise<void>;

  loadFromBackend: () => Promise<void>;

  /**
   * Get merged instructions for a conversation.
   * Priority: project > conversation > global
   *
   * @param conversationInstructions - Per-conversation instructions
   * @returns Merged instructions string
   */
  getMergedInstructions: (conversationInstructions?: string) => string;

  getInstructionsCharCount: () => {
    global: number;
    project: number;
    total: number;
  };
}

const CUSTOM_INSTRUCTIONS_STORE_VERSION = 1;

export const useCustomInstructionsStore = create<CustomInstructionsState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        globalInstructions: '',
        projectInstructions: '',
        globalInstructionsEnabled: true,
        projectInstructionsEnabled: true,
        maxInstructionsLength: 10000,

        setGlobalInstructions: (instructions: string) => {
          const maxLength = get().maxInstructionsLength;
          const trimmed = instructions.slice(0, maxLength);
          set({ globalInstructions: trimmed }, undefined, 'customInstructions/setGlobal');
          get().saveToBackend();
        },

        setProjectInstructions: (instructions: string) => {
          const maxLength = get().maxInstructionsLength;
          const trimmed = instructions.slice(0, maxLength);
          set({ projectInstructions: trimmed }, undefined, 'customInstructions/setProject');
        },

        setGlobalInstructionsEnabled: (enabled: boolean) => {
          set(
            { globalInstructionsEnabled: enabled },
            undefined,
            'customInstructions/setGlobalEnabled',
          );
          get().saveToBackend();
        },

        setProjectInstructionsEnabled: (enabled: boolean) => {
          set(
            { projectInstructionsEnabled: enabled },
            undefined,
            'customInstructions/setProjectEnabled',
          );
        },

        clearAllInstructions: () => {
          set(
            {
              globalInstructions: '',
              projectInstructions: '',
            },
            undefined,
            'customInstructions/clearAll',
          );
        },

        saveToBackend: async () => {
          if (!isTauriContext()) return;
          const state = get();
          const instructions = JSON.stringify({
            globalInstructions: state.globalInstructions,
            globalInstructionsEnabled: state.globalInstructionsEnabled,
          });
          try {
            await invoke('save_custom_instructions', { instructions });
          } catch (error) {
            console.error('Failed to save custom instructions to backend:', error);
          }
        },

        loadFromBackend: async () => {
          if (!isTauriContext()) return;
          try {
            const result = await invoke<string>('load_custom_instructions');
            if (result) {
              const data = JSON.parse(result);
              set(
                {
                  globalInstructions: data.globalInstructions || '',
                  globalInstructionsEnabled: data.globalInstructionsEnabled ?? true,
                },
                undefined,
                'customInstructions/loadFromBackend',
              );
            }
          } catch (error) {
            console.error('Failed to load custom instructions from backend:', error);
          }
        },

        getMergedInstructions: (conversationInstructions?: string) => {
          const state = get();
          const parts: string[] = [];

          if (state.projectInstructionsEnabled && state.projectInstructions.trim()) {
            parts.push(
              `<project-instructions>\n${state.projectInstructions.trim()}\n</project-instructions>`,
            );
          }

          if (conversationInstructions?.trim()) {
            parts.push(
              `<conversation-instructions>\n${conversationInstructions.trim()}\n</conversation-instructions>`,
            );
          }

          if (state.globalInstructionsEnabled && state.globalInstructions.trim()) {
            parts.push(
              `<global-instructions>\n${state.globalInstructions.trim()}\n</global-instructions>`,
            );
          }

          if (parts.length === 0) {
            return '';
          }

          return `<custom-instructions>\nThe following are custom instructions provided by the user. Follow these instructions while responding:\n\n${parts.join('\n\n')}\n</custom-instructions>`;
        },

        getInstructionsCharCount: () => {
          const state = get();
          return {
            global: state.globalInstructions.length,
            project: state.projectInstructions.length,
            total: state.globalInstructions.length + state.projectInstructions.length,
          };
        },
      })),
      {
        name: 'agiworkforce-custom-instructions',
        version: CUSTOM_INSTRUCTIONS_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          globalInstructions: state.globalInstructions,
          globalInstructionsEnabled: state.globalInstructionsEnabled,
          // Note: projectInstructions are not persisted as they are loaded from project files
        }),
        migrate: (persistedState: unknown, version: number) => {
          if (version === 0) {
            return persistedState as CustomInstructionsState;
          }
          return persistedState as CustomInstructionsState;
        },
      },
    ),
    { name: 'CustomInstructionsStore', enabled: import.meta.env.DEV },
  ),
);

export const selectGlobalInstructions = (state: CustomInstructionsState) =>
  state.globalInstructions;
export const selectProjectInstructions = (state: CustomInstructionsState) =>
  state.projectInstructions;
export const selectGlobalInstructionsEnabled = (state: CustomInstructionsState) =>
  state.globalInstructionsEnabled;
export const selectProjectInstructionsEnabled = (state: CustomInstructionsState) =>
  state.projectInstructionsEnabled;
export const selectMaxInstructionsLength = (state: CustomInstructionsState) =>
  state.maxInstructionsLength;

export const selectHasGlobalInstructions = (state: CustomInstructionsState) =>
  state.globalInstructions.trim().length > 0;
export const selectHasProjectInstructions = (state: CustomInstructionsState) =>
  state.projectInstructions.trim().length > 0;
export const selectHasAnyInstructions = (state: CustomInstructionsState) =>
  state.globalInstructions.trim().length > 0 || state.projectInstructions.trim().length > 0;
export const selectGlobalInstructionsCharCount = (state: CustomInstructionsState) =>
  state.globalInstructions.length;
export const selectProjectInstructionsCharCount = (state: CustomInstructionsState) =>
  state.projectInstructions.length;
export const selectTotalInstructionsCharCount = (state: CustomInstructionsState) =>
  state.globalInstructions.length + state.projectInstructions.length;
