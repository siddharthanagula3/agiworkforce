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

export type MotionPreference = 'system' | 'reduced';

/** 'default' leaves the app's own prose font in place. */
export type ChatFont = 'default' | 'sans' | 'serif' | 'dyslexic';

export type VoiceSpeed = 'slow' | 'normal' | 'fast';

/**
 * SpeechSynthesisUtterance.rate. 1.05 was the hardcoded value before this was
 * a preference, so 'normal' keeps exactly what everyone already hears.
 */
export const VOICE_SPEED_RATES: Readonly<Record<VoiceSpeed, number>> = {
  slow: 0.8,
  normal: 1.05,
  fast: 1.35,
};

interface SettingsState {
  chatTextSize: ChatTextSize;
  motion: MotionPreference;
  chatFont: ChatFont;
  voiceSpeed: VoiceSpeed;
  /** Shortcut ids the user switched off. Read by use-keyboard-shortcuts. */
  disabledShortcutIds: string[];
  /** Sidebar destinations the user hid. Chat is never hideable. */
  hiddenNavIds: string[];
  /**
   * Start every new conversation as a temporary chat. Honoured at creation by
   * useConversations, so the very first message is never persisted.
   */
  newChatsTemporary: boolean;
  /** Composer microphone dictation. Read by the composer's dictation entry point. */
  dictationEnabled: boolean;
  codeBlockWrap: boolean;
  accentColor: AccentColor;
  highContrast: boolean;
  customCommands: CustomCommand[];
  setChatTextSize: (size: ChatTextSize) => void;
  setMotion: (motion: MotionPreference) => void;
  setChatFont: (font: ChatFont) => void;
  setVoiceSpeed: (speed: VoiceSpeed) => void;
  setShortcutEnabled: (id: string, enabled: boolean) => void;
  restoreShortcutDefaults: () => void;
  setNavItemVisible: (id: string, visible: boolean) => void;
  setNewChatsTemporary: (temporary: boolean) => void;
  setDictationEnabled: (enabled: boolean) => void;
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
      motion: 'system',
      chatFont: 'default',
      voiceSpeed: 'normal',
      disabledShortcutIds: [],
      hiddenNavIds: [],
      newChatsTemporary: false,
      dictationEnabled: true,
      codeBlockWrap: false,
      accentColor: 'default',
      highContrast: false,
      customCommands: [],
      setChatTextSize: (size) => set({ chatTextSize: size }),
      setMotion: (motion) => set({ motion }),
      setChatFont: (chatFont) => set({ chatFont }),
      setVoiceSpeed: (voiceSpeed) => set({ voiceSpeed }),
      setShortcutEnabled: (id, isEnabled) =>
        set((s) => ({
          disabledShortcutIds: isEnabled
            ? s.disabledShortcutIds.filter((entry) => entry !== id)
            : s.disabledShortcutIds.includes(id)
              ? s.disabledShortcutIds
              : [...s.disabledShortcutIds, id],
        })),
      restoreShortcutDefaults: () => set({ disabledShortcutIds: [] }),
      setNewChatsTemporary: (temporary) => set({ newChatsTemporary: temporary }),
      setDictationEnabled: (enabled) => set({ dictationEnabled: enabled }),
      setNavItemVisible: (id, visible) =>
        set((s) => ({
          hiddenNavIds: visible
            ? s.hiddenNavIds.filter((entry) => entry !== id)
            : s.hiddenNavIds.includes(id)
              ? s.hiddenNavIds
              : [...s.hiddenNavIds, id],
        })),
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
