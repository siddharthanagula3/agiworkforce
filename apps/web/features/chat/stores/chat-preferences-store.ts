import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgentMode } from '@/features/chat/types/agentMode';

interface ChatPreferencesState {
  agentMode: AgentMode;
  preferWhisperCloud: boolean;
  thinkingEnabled: boolean;
  connectorBarDismissed: boolean;
}

interface ChatPreferencesActions {
  setAgentMode: (mode: AgentMode) => void;
  setPreferWhisperCloud: (prefer: boolean) => void;
  setThinkingEnabled: (enabled: boolean) => void;
  setConnectorBarDismissed: (dismissed: boolean) => void;
}

export const useChatPreferencesStore = create<ChatPreferencesState & ChatPreferencesActions>()(
  persist(
    (set) => ({
      agentMode: 'standard',
      preferWhisperCloud: false,
      thinkingEnabled: false,
      connectorBarDismissed: false,

      setAgentMode: (mode) => set({ agentMode: mode }),
      setPreferWhisperCloud: (prefer) => set({ preferWhisperCloud: prefer }),
      setThinkingEnabled: (enabled) => set({ thinkingEnabled: enabled }),
      setConnectorBarDismissed: (dismissed) => set({ connectorBarDismissed: dismissed }),
    }),
    {
      name: 'agi-chat-preferences',
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        if (version < 2) {
          return { ...(persisted as Record<string, unknown>), connectorBarDismissed: false };
        }
        return persisted;
      },
    },
  ),
);
