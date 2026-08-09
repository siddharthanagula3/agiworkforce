'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'dark' | 'light' | 'system';
export type ChatFont = 'default' | 'system' | 'dyslexic';
export type ResponseStyle = 'concise' | 'balanced' | 'detailed' | 'technical';
/**
 * Transcript text scale. Backed by a REAL CSS hook — see the
 * `html[data-chat-text-size]` rules in `app/globals.css` and the applier in
 * `shared/components/AppearancePreferences.tsx`. A previous `chatFontSize`
 * field was removed because it had no reader and no stylesheet behind it, so
 * changing it did nothing visible.
 */
export type ChatTextSize = 'small' | 'default' | 'large';

export interface CustomCommand {
  id: string;
  name: string;
  description: string;
  template: string;
}

export interface NotificationPreferences {
  emailWeeklySummary: boolean;
  emailAgentTaskComplete: boolean;
  emailBillingAlerts: boolean;
  pushTaskComplete: boolean;
  pushMention: boolean;
}

interface SettingsState {
  theme: Theme;
  chatFont: ChatFont;
  chatTextSize: ChatTextSize;
  /** Soft-wrap long lines in fenced code blocks instead of scrolling them. */
  codeBlockWrap: boolean;
  showTokenCount: boolean;
  streamingEnabled: boolean;
  responseStyle: ResponseStyle;
  notifications: NotificationPreferences;
  customCommands: CustomCommand[];
  // Actions
  setTheme: (theme: Theme) => void;
  setChatFont: (font: ChatFont) => void;
  setChatTextSize: (size: ChatTextSize) => void;
  setCodeBlockWrap: (wrap: boolean) => void;
  setShowTokenCount: (show: boolean) => void;
  setStreamingEnabled: (enabled: boolean) => void;
  setResponseStyle: (style: ResponseStyle) => void;
  setNotification: (key: keyof NotificationPreferences, value: boolean) => void;
  addCustomCommand: (cmd: Omit<CustomCommand, 'id'>) => void;
  updateCustomCommand: (id: string, cmd: Partial<Omit<CustomCommand, 'id'>>) => void;
  deleteCustomCommand: (id: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      chatFont: 'default',
      chatTextSize: 'default',
      codeBlockWrap: false,
      showTokenCount: false,
      streamingEnabled: true,
      responseStyle: 'balanced',
      customCommands: [],
      notifications: {
        emailWeeklySummary: true,
        emailAgentTaskComplete: true,
        emailBillingAlerts: true,
        pushTaskComplete: false,
        pushMention: false,
      },
      setTheme: (theme) => set({ theme }),
      setChatFont: (font) => set({ chatFont: font }),
      setChatTextSize: (size) => set({ chatTextSize: size }),
      setCodeBlockWrap: (wrap) => set({ codeBlockWrap: wrap }),
      setShowTokenCount: (show) => set({ showTokenCount: show }),
      setStreamingEnabled: (enabled) => set({ streamingEnabled: enabled }),
      setResponseStyle: (style) => set({ responseStyle: style }),
      setNotification: (key, value) =>
        set((state) => ({ notifications: { ...state.notifications, [key]: value } })),
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
