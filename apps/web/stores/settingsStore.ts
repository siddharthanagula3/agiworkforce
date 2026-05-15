'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'dark' | 'light' | 'system';
export type ChatFontSize = 'sm' | 'md' | 'lg';
export type ChatFont = 'default' | 'system' | 'dyslexic';
export type ResponseStyle = 'concise' | 'balanced' | 'detailed' | 'technical';

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
  chatFontSize: ChatFontSize;
  chatFont: ChatFont;
  showTokenCount: boolean;
  streamingEnabled: boolean;
  defaultModel: string;
  defaultModelTier: 'economy' | 'balanced' | 'premium';
  responseStyle: ResponseStyle;
  notifications: NotificationPreferences;
  /**
   * Advanced mode toggle state. When true, the manually-selected model
   * (`advancedModelId`) is used instead of auto-routing.
   * Only meaningful for tiers where `allowManualSelection === true` (Pro, Max).
   * Persisted to localStorage so the choice survives page refreshes.
   */
  advancedMode: boolean;
  /**
   * The model ID the user has explicitly chosen in Advanced mode.
   * `null` means "not yet picked" — the chat layer falls back to auto-routing.
   * Only applied when `advancedMode === true`.
   */
  advancedModelId: string | null;
  customCommands: CustomCommand[];
  // Actions
  setTheme: (theme: Theme) => void;
  setChatFontSize: (size: ChatFontSize) => void;
  setChatFont: (font: ChatFont) => void;
  setShowTokenCount: (show: boolean) => void;
  setStreamingEnabled: (enabled: boolean) => void;
  setDefaultModel: (modelId: string, tier: 'economy' | 'balanced' | 'premium') => void;
  setResponseStyle: (style: ResponseStyle) => void;
  setNotification: (key: keyof NotificationPreferences, value: boolean) => void;
  setAdvancedMode: (enabled: boolean) => void;
  setAdvancedModelId: (modelId: string | null) => void;
  addCustomCommand: (cmd: Omit<CustomCommand, 'id'>) => void;
  updateCustomCommand: (id: string, cmd: Partial<Omit<CustomCommand, 'id'>>) => void;
  deleteCustomCommand: (id: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      chatFontSize: 'md',
      chatFont: 'default',
      showTokenCount: false,
      streamingEnabled: true,
      defaultModel: 'auto-balanced',
      defaultModelTier: 'balanced',
      responseStyle: 'balanced',
      advancedMode: false,
      advancedModelId: null,
      customCommands: [],
      notifications: {
        emailWeeklySummary: true,
        emailAgentTaskComplete: true,
        emailBillingAlerts: true,
        pushTaskComplete: false,
        pushMention: false,
      },
      setTheme: (theme) => set({ theme }),
      setChatFontSize: (size) => set({ chatFontSize: size }),
      setChatFont: (font) => set({ chatFont: font }),
      setShowTokenCount: (show) => set({ showTokenCount: show }),
      setStreamingEnabled: (enabled) => set({ streamingEnabled: enabled }),
      setDefaultModel: (modelId, tier) => set({ defaultModel: modelId, defaultModelTier: tier }),
      setResponseStyle: (style) => set({ responseStyle: style }),
      setNotification: (key, value) =>
        set((state) => ({ notifications: { ...state.notifications, [key]: value } })),
      setAdvancedMode: (enabled) => set({ advancedMode: enabled }),
      setAdvancedModelId: (modelId) => set({ advancedModelId: modelId }),
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
