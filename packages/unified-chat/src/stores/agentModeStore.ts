/**
 * agentModeStore — surface-agnostic store for the 4-mode agent switcher.
 *
 * Modes:
 *   safe      — minimal tool use; confirms before any action
 *   plan      — read-only analysis; never writes or executes
 *   build     — full access; edits + runs with approval prompts
 *   autopilot — auto-approves all tools; no confirmation
 *
 * Phase A Slice 5 (ported from apps/desktop/src/stores/settingsStore chatPreferences.agentMode)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AgentMode = 'safe' | 'plan' | 'build' | 'autopilot';

interface AgentModeState {
  agentMode: AgentMode;
  setAgentMode: (mode: AgentMode) => Promise<void>;
}

export const useAgentModeStore = create<AgentModeState>()(
  persist(
    (set) => ({
      agentMode: 'safe' as AgentMode,

      setAgentMode: async (mode: AgentMode) => {
        set({ agentMode: mode });
      },
    }),
    {
      name: 'chat-agent-mode-store',
    },
  ),
);

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectAgentMode = (s: AgentModeState): AgentMode => s.agentMode;
export const selectIsPlanMode = (s: AgentModeState): boolean => s.agentMode === 'plan';
export const selectIsAutopilotMode = (s: AgentModeState): boolean => s.agentMode === 'autopilot';
