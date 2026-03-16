import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgentMode } from '@/components/UnifiedAgenticChat/AgentModeSwitcher';

interface ChatPreferencesState {
  agentMode: AgentMode;
  preferWhisperCloud: boolean;
}

interface ChatPreferencesActions {
  setAgentMode: (mode: AgentMode) => void;
  setPreferWhisperCloud: (prefer: boolean) => void;
}

export const useChatPreferencesStore = create<ChatPreferencesState & ChatPreferencesActions>()(
  persist(
    (set) => ({
      agentMode: 'standard',
      preferWhisperCloud: false,

      setAgentMode: (mode) => set({ agentMode: mode }),
      setPreferWhisperCloud: (prefer) => set({ preferWhisperCloud: prefer }),
    }),
    {
      name: 'agi-chat-preferences',
      version: 1,
    },
  ),
);
