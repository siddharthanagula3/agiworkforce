import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { useSettingsStore } from './settingsStore';

/**
 * Agent status types matching the Rust backend events
 */
export type AgentStatus =
  | { type: 'idle' }
  | { type: 'thinking'; message?: string }
  | { type: 'tool_execution'; tool: string; description?: string }
  | { type: 'screenshot'; description?: string }
  | { type: 'typing'; target?: string }
  | { type: 'clicking'; target?: string }
  | { type: 'browsing'; url?: string }
  | { type: 'reading_file'; path?: string }
  | { type: 'writing_file'; path?: string }
  | { type: 'executing_code'; language?: string }
  | { type: 'error'; message: string };

/**
 * Conversation mode determines agent behavior
 * - 'safe': Agent asks for permission before taking actions
 * - 'full_control': Agent acts autonomously without permission prompts
 */
export type ConversationMode = 'safe' | 'full_control';

interface UnifiedChatState {
  // Agent status tracking
  agentStatus: AgentStatus;
  setAgentStatus: (status: AgentStatus) => void;

  // Conversation mode (safe vs full_control)
  conversationMode: ConversationMode;
  setConversationMode: (mode: ConversationMode) => void;

  // Selected model for current conversation
  selectedModel: string | null;
  setSelectedModel: (model: string | null) => void;
}

/**
 * Unified chat store for managing agent status, conversation mode, and model selection
 * This store is separate from chatStore to keep concerns separated and allow for
 * easier integration of new unified chat features
 */
export const useUnifiedChatStore = create<UnifiedChatState>((set) => ({
  // Initial state
  agentStatus: { type: 'idle' },
  conversationMode: 'safe', // Default to safe mode
  selectedModel: null, // Will default to Ollama in the UI

  // Actions
  setAgentStatus: (status) => set({ agentStatus: status }),
  setConversationMode: (mode) => set({ conversationMode: mode }),
  setSelectedModel: (model) => set({ selectedModel: model }),
}));

/**
 * Initialize event listeners for agent status updates from Rust backend
 * Should be called once on app startup
 */
export async function initializeAgentStatusListener() {
  // Listen for agent status updates from Rust backend
  await listen<AgentStatus>('agent:status:update', (event) => {
    useUnifiedChatStore.getState().setAgentStatus(event.payload);
  });

  // Auto-reset to idle after certain events complete
  await listen('agent:goal:completed', () => {
    useUnifiedChatStore.getState().setAgentStatus({ type: 'idle' });
  });

  await listen('agent:goal:failed', () => {
    useUnifiedChatStore.getState().setAgentStatus({ type: 'idle' });
  });
}
