'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ChatTextSize = 'small' | 'default' | 'large';

export type AccentColor = 'default' | 'green' | 'blue' | 'violet' | 'rose';

export const ACCENT_COLORS: ReadonlyArray<{ value: AccentColor; label: string }> = [
  { value: 'default', label: 'AGI amber' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'violet', label: 'Violet' },
  { value: 'rose', label: 'Rose' },
];

export interface CustomCommand {
  id: string;
  name: string;
  description: string;
  template: string;
}

interface SettingsState {
  chatTextSize: ChatTextSize;
  codeBlockWrap: boolean;
  accentColor: AccentColor;
  highContrast: boolean;
  customCommands: CustomCommand[];
  setChatTextSize: (size: ChatTextSize) => void;
  setCodeBlockWrap: (wrap: boolean) => void;
  setAccentColor: (accent: AccentColor) => void;
  setHighContrast: (on: boolean) => void;
  addCustomCommand: (cmd: Omit<CustomCommand, 'id'>) => void;
  updateCustomCommand: (id: string, cmd: Partial<Omit<CustomCommand, 'id'>>) => void;
  deleteCustomCommand: (id: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      chatTextSize: 'default',
      codeBlockWrap: false,
      accentColor: 'default',
      highContrast: false,
      customCommands: [],
      setChatTextSize: (size) => set({ chatTextSize: size }),
      setCodeBlockWrap: (wrap) => set({ codeBlockWrap: wrap }),
      setAccentColor: (accent) => set({ accentColor: accent }),
      setHighContrast: (on) => set({ highContrast: on }),
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
