/**
 * Prompt Stash Store
 *
 * Persists a list of user-saved prompts (max 50) to localStorage so they
 * survive restarts. Provides save, load, remove, updateLabel, and clear.
 *
 * Middleware: persist (localStorage via storageFallback)
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storageFallback } from '../lib/storageFallback';

// ============================================================================
// Types
// ============================================================================

export interface PromptStashEntry {
  id: string;
  text: string;
  label?: string;
  createdAt: number;
}

interface PromptStashState {
  entries: PromptStashEntry[];
  save: (text: string, label?: string) => void;
  load: (id: string) => string | undefined;
  remove: (id: string) => void;
  updateLabel: (id: string, label: string) => void;
  clear: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_ENTRIES = 50;
const STORE_NAME = 'agiworkforce-prompt-stash';

// ============================================================================
// Store
// ============================================================================

export const usePromptStashStore = create<PromptStashState>()(
  persist(
    (set, get) => ({
      entries: [],

      save: (text: string, label?: string) => {
        const id = `stash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const entry: PromptStashEntry = { id, text, label, createdAt: Date.now() };
        set((state) => ({
          entries: [entry, ...state.entries].slice(0, MAX_ENTRIES),
        }));
      },

      load: (id: string) => {
        return get().entries.find((e) => e.id === id)?.text;
      },

      remove: (id: string) => {
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== id),
        }));
      },

      updateLabel: (id: string, label: string) => {
        set((state) => ({
          entries: state.entries.map((e) => (e.id === id ? { ...e, label } : e)),
        }));
      },

      clear: () => set({ entries: [] }),
    }),
    {
      name: STORE_NAME,
      version: 1,
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? storageFallback : window.localStorage,
      ),
    },
  ),
);
