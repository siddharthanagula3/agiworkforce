'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Web settings that are device-local by design.
 *
 * EVERY field here must have a production consumer. That rule is enforced by
 * `apps/web/__tests__/settings-store-fields-are-consumed.test.ts`, which reads
 * this file, extracts the `SettingsState` members, and fails when one is never
 * read or never written outside of tests.
 *
 * The rule exists because this store had accumulated six members that no screen
 * touched: `theme` (the real one lives in `ThemeContext`, reached through
 * `useAppTheme`), `chatFont`, `showTokenCount`, `streamingEnabled`,
 * `responseStyle` (the real one is `features/chat/stores/style-store`, read by
 * `ChatComposerNew`) and `notifications` (the real ones are persisted
 * server-side by `NotificationsSection` through `/api/settings/preferences`).
 * A duplicate field with no reader is worse than a missing one: it looks
 * settable, and it gives a second answer to a question that already has one.
 *
 * An earlier `chatFontSize` and `defaultModel` were removed for the same
 * reason; see `NotificationsSection.tsx` for the same rule applied to the
 * server-persisted namespace.
 */

/**
 * Transcript text scale. Backed by a REAL CSS hook — see the
 * `html[data-chat-text-size]` rules in `app/globals.css` and the applier in
 * `shared/components/AppearancePreferences.tsx`.
 */
export type ChatTextSize = 'small' | 'default' | 'large';

export interface CustomCommand {
  id: string;
  name: string;
  description: string;
  template: string;
}

interface SettingsState {
  chatTextSize: ChatTextSize;
  /** Soft-wrap long lines in fenced code blocks instead of scrolling them. */
  codeBlockWrap: boolean;
  /** Slash commands the user defined; consumed by `SlashCommandMenu`. */
  customCommands: CustomCommand[];
  // Actions
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
