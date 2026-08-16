import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PromptStashEntry {
  id: string;
  text: string;
  label?: string;
  createdAt: number;
}

interface PromptStashState {
  entries: PromptStashEntry[];

  save: (text: string, label?: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

function genId(): string {
  return `ps-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const usePromptStashStore = create<PromptStashState>()(
  persist(
    (set) => ({
      entries: [],

      save: (text, label) =>
        set((state) => ({
          entries: [{ id: genId(), text, label, createdAt: Date.now() }, ...state.entries].slice(
            0,
            50,
          ), // cap at 50 entries
        })),

      remove: (id) => set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),

      clear: () => set({ entries: [] }),
    }),
    {
      name: 'chat-prompt-stash',
    },
  ),
);

export const selectPromptStashEntries = (s: PromptStashState): PromptStashEntry[] => s.entries;
export const selectPromptStashCount = (s: PromptStashState): number => s.entries.length;
