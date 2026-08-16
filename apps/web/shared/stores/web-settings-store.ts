'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ChatTextSize = 'small' | 'default' | 'large';

export interface CustomCommand {
  id: string;
  name: string;
  description: string;
  template: string;
}

interface SettingsState {
  chatTextSize: ChatTextSize;
  codeBlockWrap: boolean;
  customCommands: CustomCommand[];
  setChatTextSize: (size: ChatTextSize) => void;
  setCodeBlockWrap: (wrap: boolean) => void;
  addCustomCommand: (cmd: Omit<CustomCommand, 'id'>) => void;
  updateCustomCommand: (id: string, cmd: Partial<Omit<CustomCommand, 'id'>>) => void;
  deleteCustomCommand: (id: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      chatTextSize: 'default',
      codeBlockWrap: false,
      customCommands: [],
      setChatTextSize: (size) => set({ chatTextSize: size }),
      setCodeBlockWrap: (wrap) => set({ codeBlockWrap: wrap }),
      addCustomCommand: (cmd) =>
        set((s) => ({
          customCommands: [
            ...s.customCommands,
            { ...cmd, id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
          ],
        })),
      updateCustomCommand: (id, patch) =>
        set((s) => ({
          customCommands: s.customCommands.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      deleteCustomCommand: (id) =>
        set((s) => ({ customCommands: s.customCommands.filter((c) => c.id !== id) })),
    }),
    {
      name: 'agiworkforce-web-settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
