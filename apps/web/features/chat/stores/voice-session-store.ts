import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { useVoiceInputStore } from '@features/chat/stores/voice-input-store';
import {
  INITIAL_VOICE_SESSION_STATE,
  isVoiceSessionActive,
  voiceSessionReducer,
  VOICE_SESSION_EVENT,
  type VoiceSessionEvent,
  type VoiceSessionState,
} from '@agiworkforce/unified-chat';

const STORE_NAME = 'agi-web-voice-session';
const STORE_VERSION = 1;

export const VOICE_LANGUAGE_AUTO = '';

export const VOICE_INTELLIGENCE = {
  economy: 'economy',
  balanced: 'balanced',
  premium: 'premium',
} as const;

export type VoiceIntelligence = (typeof VOICE_INTELLIGENCE)[keyof typeof VOICE_INTELLIGENCE];

interface VoiceSessionStoreState {
  session: VoiceSessionState;
  focusMode: boolean;
  dockOpen: boolean;
  settingsOpen: boolean;
  activityMessageId: string | null;
  intelligence: VoiceIntelligence;
  language: string;
}

interface VoiceSessionStoreActions {
  dispatch: (event: VoiceSessionEvent) => void;
  toggleFocusMode: () => void;
  setDockOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setActivityMessageId: (messageId: string | null) => void;
  setIntelligence: (intelligence: VoiceIntelligence) => void;
  setLanguage: (language: string) => void;
}

const PANELS_CLOSED = {
  focusMode: false,
  dockOpen: false,
  settingsOpen: false,
  activityMessageId: null,
} as const;

export const useVoiceSessionStore = create<VoiceSessionStoreState & VoiceSessionStoreActions>()(
  persist(
    (set, get) => ({
      session: INITIAL_VOICE_SESSION_STATE,
      ...PANELS_CLOSED,
      intelligence: VOICE_INTELLIGENCE.balanced,
      language: VOICE_LANGUAGE_AUTO,

      dispatch: (event) => {
        const session = voiceSessionReducer(get().session, event);
        if (session === get().session) return;
        set(isVoiceSessionActive(session.status) ? { session } : { session, ...PANELS_CLOSED });
      },

      toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
      setDockOpen: (dockOpen) =>
        set(dockOpen ? { dockOpen, activityMessageId: null } : { dockOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setActivityMessageId: (activityMessageId) =>
        set(activityMessageId ? { activityMessageId, dockOpen: false } : { activityMessageId }),
      setIntelligence: (intelligence) => set({ intelligence }),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      partialize: (state) => ({
        intelligence: state.intelligence,
        language: state.language,
      }),
    },
  ),
);

export function useVoiceModeActive(): boolean {
  return useVoiceSessionStore((state) => isVoiceSessionActive(state.session.status));
}

export function enterVoiceSession(): void {
  useVoiceInputStore.getState().cancelListening();
  useVoiceSessionStore.getState().dispatch({ type: VOICE_SESSION_EVENT.enter });
}
