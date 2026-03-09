/**
 * Chat Preferences Store
 *
 * Manages chat-related preferences: prompt completion, agent mode,
 * compact mode, auto-approve tools, skill injection.
 *
 * Middleware: devtools(persist(subscribeWithSelector(...)))
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';
import { storageFallback } from '../lib/storageFallback';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent operating modes:
 * - 'safe'     — minimal tool use, always confirms before acting
 * - 'plan'     — READ-ONLY: reads files, searches, analyses, but NEVER writes/edits/executes.
 *                Shows a plan before asking user to switch to 'build' to apply it.
 * - 'build'    — full tool access, can write/edit files and run shell commands (default)
 * - 'autopilot'— full tool access, skips all confirmation dialogs
 */
export type AgentMode = 'safe' | 'plan' | 'build' | 'autopilot';

export interface ChatPreferences {
  /** Enable AI-powered prompt completion (ghost text suggestions) */
  promptCompletionEnabled: boolean;
  /** Always use agent mode with tools for all messages (not just action requests) */
  alwaysUseAgentMode: boolean;
  /** Show simple one-line status messages instead of detailed command/code blocks */
  compactMode: boolean;
  /**
   * Auto-approve all tool confirmation dialogs — skips every "Allow this action?" popup.
   * Equivalent to God Mode / trust-all. Use with caution.
   */
  autoApproveTools: boolean;
  /** Enable automatic skill injection based on message intent */
  autoInjectSkills?: boolean;
  /** Agent execution mode — controls which tools are allowed and whether approval dialogs appear */
  agentMode: AgentMode;
}

interface ChatPreferencesState {
  chatPreferences: ChatPreferences;
}

interface ChatPreferencesActions {
  setPromptCompletionEnabled: (enabled: boolean) => void;
  setAlwaysUseAgentMode: (enabled: boolean) => void;
  setCompactMode: (enabled: boolean) => void;
  setAutoInjectSkills: (enabled: boolean) => void;
  setAutoApproveTools: (enabled: boolean) => Promise<void>;
  setAgentMode: (mode: AgentMode) => Promise<void>;
}

export type ChatPreferencesStore = ChatPreferencesState & ChatPreferencesActions;

// ============================================================================
// Defaults
// ============================================================================

export const defaultChatPreferences: ChatPreferences = {
  promptCompletionEnabled: true,
  alwaysUseAgentMode: false,
  compactMode: true,
  autoApproveTools: false,
  autoInjectSkills: true,
  agentMode: 'build' as AgentMode,
};

// ============================================================================
// Store
// ============================================================================

export const useChatPreferencesStore = create<ChatPreferencesStore>()(
  devtools(
    persist(
      subscribeWithSelector((set) => ({
        chatPreferences: { ...defaultChatPreferences },

        setPromptCompletionEnabled: (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, promptCompletionEnabled: enabled },
            }),
            undefined,
            'chatPreferences/setPromptCompletionEnabled',
          );
        },

        setAlwaysUseAgentMode: (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, alwaysUseAgentMode: enabled },
            }),
            undefined,
            'chatPreferences/setAlwaysUseAgentMode',
          );
        },

        setCompactMode: (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, compactMode: enabled },
            }),
            undefined,
            'chatPreferences/setCompactMode',
          );
        },

        setAutoInjectSkills: (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, autoInjectSkills: enabled },
            }),
            undefined,
            'chatPreferences/setAutoInjectSkills',
          );
        },

        setAutoApproveTools: async (enabled: boolean) => {
          set(
            (state) => ({
              chatPreferences: { ...state.chatPreferences, autoApproveTools: enabled },
            }),
            undefined,
            'chatPreferences/setAutoApproveTools',
          );
        },

        setAgentMode: async (mode: AgentMode) => {
          set(
            (state) => ({
              chatPreferences: {
                ...state.chatPreferences,
                agentMode: mode,
                autoApproveTools: mode === 'autopilot',
                alwaysUseAgentMode:
                  mode === 'plan' ? true : state.chatPreferences.alwaysUseAgentMode,
              },
            }),
            undefined,
            'chatPreferences/setAgentMode',
          );
          try {
            await invoke('set_agent_mode', { mode });
          } catch (error) {
            console.error('Failed to sync agent mode to backend:', error);
          }
        },
      })),
      {
        name: 'agiworkforce-chat-preferences',
        version: 1,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          chatPreferences: state.chatPreferences,
        }),
      },
    ),
    { name: 'ChatPreferencesStore', enabled: import.meta.env.DEV },
  ),
);
