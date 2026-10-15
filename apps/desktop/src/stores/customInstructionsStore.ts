import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { invoke, isTauriContext } from '../lib/tauri-mock';
import { storageFallback } from '../lib/storageFallback';

export interface CustomInstructionsState {
  globalInstructions: string;

  globalInstructionsEnabled: boolean;

  maxInstructionsLength: number;

  setGlobalInstructions: (instructions: string) => void;

  setGlobalInstructionsEnabled: (enabled: boolean) => void;

  saveToBackend: () => Promise<void>;

  loadFromBackend: () => Promise<void>;
}

const CUSTOM_INSTRUCTIONS_STORE_VERSION = 1;

export const useCustomInstructionsStore = create<CustomInstructionsState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        globalInstructions: '',
        globalInstructionsEnabled: true,
        maxInstructionsLength: 10000,

        setGlobalInstructions: (instructions: string) => {
          const maxLength = get().maxInstructionsLength;
          const trimmed = instructions.slice(0, maxLength);
          set({ globalInstructions: trimmed }, undefined, 'customInstructions/setGlobal');
          get().saveToBackend();
        },

        setGlobalInstructionsEnabled: (enabled: boolean) => {
          set(
            { globalInstructionsEnabled: enabled },
            undefined,
            'customInstructions/setGlobalEnabled',
          );
          get().saveToBackend();
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
        }),
        migrate: (persistedState: unknown) => persistedState as CustomInstructionsState,
      },
    ),
    { name: 'CustomInstructionsStore', enabled: import.meta.env.DEV },
  ),
);
