/**
 * Custom Instructions Store
 *
 * Manages global custom instructions that apply to all conversations,
 * as well as project-level instructions.
 *
 * Priority order (highest to lowest):
 * 1. Project instructions (from .claude/CLAUDE.md or similar)
 * 2. Per-conversation instructions (stored in conversation)
 * 3. Global instructions (stored here)
 *
 * Updated to Zustand v5 best practices:
 * - Middleware composition: devtools(persist(subscribeWithSelector(...)))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Persist middleware: Using createJSONStorage, partialize, version, migrate
 * - Better devtools integration with store name
 * - subscribeWithSelector for granular subscriptions
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

export interface CustomInstructionsState {
  /** Global instructions that apply to all conversations */
  globalInstructions: string;

  /** Project-specific instructions (loaded from project files) */
  projectInstructions: string;

  /** Whether global instructions are enabled */
  globalInstructionsEnabled: boolean;

  /** Whether project instructions are enabled */
  projectInstructionsEnabled: boolean;

  /** Maximum character limit for instructions */
  maxInstructionsLength: number;

  /** Set global instructions */
  setGlobalInstructions: (instructions: string) => void;

  /** Set project instructions */
  setProjectInstructions: (instructions: string) => void;

  /** Toggle global instructions enabled/disabled */
  setGlobalInstructionsEnabled: (enabled: boolean) => void;

  /** Toggle project instructions enabled/disabled */
  setProjectInstructionsEnabled: (enabled: boolean) => void;

  /** Clear all instructions */
  clearAllInstructions: () => void;

  /** Save instructions to Tauri backend for persistence across sessions */
  saveToBackend: () => Promise<void>;

  /** Load instructions from Tauri backend */
  loadFromBackend: () => Promise<void>;

  /**
   * Get merged instructions for a conversation.
   * Priority: project > conversation > global
   *
   * @param conversationInstructions - Per-conversation instructions
   * @returns Merged instructions string
   */
  getMergedInstructions: (conversationInstructions?: string) => string;

  /**
   * Get character count for instructions
   */
  getInstructionsCharCount: () => {
    global: number;
    project: number;
    total: number;
  };
}

// Storage fallback for SSR/non-browser environments
const storageFallback: Storage = {
  get length() {
    return 0;
  },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

// Version for storage migration
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
          set({ globalInstructions: trimmed });
          // Persist to backend asynchronously
          get().saveToBackend();
        },

        setProjectInstructions: (instructions: string) => {
          const maxLength = get().maxInstructionsLength;
          const trimmed = instructions.slice(0, maxLength);
          set({ projectInstructions: trimmed });
        },

        setGlobalInstructionsEnabled: (enabled: boolean) => {
          set({ globalInstructionsEnabled: enabled });
          // Persist to backend asynchronously
          get().saveToBackend();
        },

        setProjectInstructionsEnabled: (enabled: boolean) => {
          set({ projectInstructionsEnabled: enabled });
        },

        clearAllInstructions: () => {
          set({
            globalInstructions: '',
            projectInstructions: '',
          });
        },

        saveToBackend: async () => {
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
          try {
            const result = await invoke<string>('load_custom_instructions');
            if (result) {
              const data = JSON.parse(result);
              set({
                globalInstructions: data.globalInstructions || '',
                globalInstructionsEnabled: data.globalInstructionsEnabled ?? true,
              });
            }
          } catch (error) {
            console.error('Failed to load custom instructions from backend:', error);
          }
        },

        getMergedInstructions: (conversationInstructions?: string) => {
          const state = get();
          const parts: string[] = [];

          // Add project instructions (highest priority)
          if (state.projectInstructionsEnabled && state.projectInstructions.trim()) {
            parts.push(
              `<project-instructions>\n${state.projectInstructions.trim()}\n</project-instructions>`,
            );
          }

          // Add conversation-specific instructions (medium priority)
          if (conversationInstructions?.trim()) {
            parts.push(
              `<conversation-instructions>\n${conversationInstructions.trim()}\n</conversation-instructions>`,
            );
          }

          // Add global instructions (lowest priority)
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
          // Migration logic for future schema changes
          if (version === 0) {
            return persistedState as CustomInstructionsState;
          }
          return persistedState as CustomInstructionsState;
        },
      },
    ),
    { name: 'CustomInstructionsStore', enabled: process.env['NODE_ENV'] === 'development' },
  ),
);
