import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import type { AgentMode, Effort } from '@agiworkforce/types';

interface AgentControlState {
  /** Active agent operating mode. Persisted per device. */
  agentMode: AgentMode;
  /** Active effort level. Persisted per device. */
  effort: Effort;

  setAgentMode: (mode: AgentMode) => void;
  setEffort: (effort: Effort) => void;
}

export const useAgentControlStore = create<AgentControlState>()(
  persist(
    (set) => ({
      agentMode: 'ask',
      effort: 'medium',

      setAgentMode: (mode) => set({ agentMode: mode }),
      setEffort: (effort) => set({ effort }),
    }),
    {
      name: 'agent-control-store',
      storage: createJSONStorage(() => mmkvStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[agentControlStore] Hydration failed:', error);
      },
    },
  ),
);
