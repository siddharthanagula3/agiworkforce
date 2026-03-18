'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'dark' | 'light' | 'system';
export type ChatFontSize = 'sm' | 'md' | 'lg';
export type ChatFont = 'default' | 'system' | 'dyslexic';

interface SettingsState {
  theme: Theme;
  chatFontSize: ChatFontSize;
  chatFont: ChatFont;
  showTokenCount: boolean;
  streamingEnabled: boolean;
  defaultModel: string;
  defaultModelTier: 'economy' | 'balanced' | 'premium';
  // Actions
  setTheme: (theme: Theme) => void;
  setChatFontSize: (size: ChatFontSize) => void;
  setChatFont: (font: ChatFont) => void;
  setShowTokenCount: (show: boolean) => void;
  setStreamingEnabled: (enabled: boolean) => void;
  setDefaultModel: (modelId: string, tier: 'economy' | 'balanced' | 'premium') => void;
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
      setTheme: (theme) => set({ theme }),
      setChatFontSize: (size) => set({ chatFontSize: size }),
      setChatFont: (font) => set({ chatFont: font }),
      setShowTokenCount: (show) => set({ showTokenCount: show }),
      setStreamingEnabled: (enabled) => set({ streamingEnabled: enabled }),
      setDefaultModel: (modelId, tier) => set({ defaultModel: modelId, defaultModelTier: tier }),
    }),
    {
      name: 'agiworkforce-web-settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
