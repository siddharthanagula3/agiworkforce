import { create } from 'zustand';
import { invoke } from '../lib/tauri-mock';

export interface Shortcut {
  id: string;
  key: string;
  description: string;
  action: string;
  enabled: boolean;
  is_global?: boolean;
}

interface ShortcutState {
  update: (shortcutId: string, newKey?: string, enabled?: boolean) => Promise<Shortcut>;
  reset: () => Promise<Shortcut[]>;
}

export const useShortcutStore = create<ShortcutState>()(() => ({
  update: (shortcutId, newKey, enabled) =>
    invoke<Shortcut>('shortcuts_update', {
      shortcutId,
      newKey: newKey ?? null,
      enabled: enabled ?? null,
    }),

  reset: () => invoke<Shortcut[]>('shortcuts_reset'),
}));
