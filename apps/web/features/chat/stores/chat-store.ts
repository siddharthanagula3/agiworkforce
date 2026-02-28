'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  isStreaming?: boolean;
  metadata?: {
    model?: string;
    tokensUsed?: number;
    thinkingSteps?: string[];
  };
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  preview: string;
  messageCount: number;
}

interface ChatState {
  sessions: ChatSession[];
  messages: Record<string, ChatMessage[]>;
  activeSessionId: string | null;
  isLoading: boolean;
  sidebarOpen: boolean;
}

interface ChatActions {
  createSession: () => string;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  addMessage: (
    sessionId: string,
    message: Omit<ChatMessage, 'id' | 'createdAt' | 'sessionId'>,
  ) => string;
  updateMessage: (sessionId: string, messageId: string, content: string) => void;
  deleteMessage: (sessionId: string, messageId: string) => void;
  setStreaming: (sessionId: string, messageId: string, streaming: boolean) => void;
  appendToMessage: (sessionId: string, messageId: string, chunk: string) => void;
  setLoading: (loading: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  getSessionMessages: (sessionId: string) => ChatMessage[];
  clearSession: (sessionId: string) => void;
}

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getGreetingTime(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

// ============================================================================
// Store
// ============================================================================

export const useChatStore = create<ChatState & ChatActions>()(
  persist(
    immer((set, get) => ({
      // State
      sessions: [],
      messages: {},
      activeSessionId: null,
      isLoading: false,
      sidebarOpen: true,

      // Actions
      createSession: () => {
        const id = generateId();
        const now = new Date();
        set((state) => {
          state.sessions.unshift({
            id,
            title: 'New Chat',
            createdAt: now,
            updatedAt: now,
            preview: '',
            messageCount: 0,
          });
          state.messages[id] = [];
          state.activeSessionId = id;
        });
        return id;
      },

      deleteSession: (sessionId) => {
        set((state) => {
          state.sessions = state.sessions.filter((s) => s.id !== sessionId);
          delete state.messages[sessionId];
          if (state.activeSessionId === sessionId) {
            state.activeSessionId = state.sessions[0]?.id ?? null;
          }
        });
      },

      renameSession: (sessionId, title) => {
        set((state) => {
          const session = state.sessions.find((s) => s.id === sessionId);
          if (session) {
            session.title = title;
            session.updatedAt = new Date();
          }
        });
      },

      setActiveSession: (sessionId) => {
        set((state) => {
          state.activeSessionId = sessionId;
        });
      },

      addMessage: (sessionId, message) => {
        const id = generateId();
        const now = new Date();
        set((state) => {
          if (!state.messages[sessionId]) {
            state.messages[sessionId] = [];
          }
          state.messages[sessionId].push({
            ...message,
            id,
            sessionId,
            createdAt: now,
          });
          // Update session metadata
          const session = state.sessions.find((s) => s.id === sessionId);
          if (session) {
            session.updatedAt = now;
            session.messageCount = state.messages[sessionId].length;
            session.preview = message.content.slice(0, 100);
            // Auto-title from first user message
            if (message.role === 'user' && session.title === 'New Chat') {
              session.title =
                message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '');
            }
          }
        });
        return id;
      },

      updateMessage: (sessionId, messageId, content) => {
        set((state) => {
          const msgs = state.messages[sessionId];
          if (msgs) {
            const msg = msgs.find((m) => m.id === messageId);
            if (msg) {
              msg.content = content;
            }
          }
        });
      },

      deleteMessage: (sessionId, messageId) => {
        set((state) => {
          const msgs = state.messages[sessionId];
          if (msgs) {
            state.messages[sessionId] = msgs.filter((m) => m.id !== messageId);
          }
        });
      },

      setStreaming: (sessionId, messageId, streaming) => {
        set((state) => {
          const msgs = state.messages[sessionId];
          if (msgs) {
            const msg = msgs.find((m) => m.id === messageId);
            if (msg) {
              msg.isStreaming = streaming;
            }
          }
        });
      },

      appendToMessage: (sessionId, messageId, chunk) => {
        set((state) => {
          const msgs = state.messages[sessionId];
          if (msgs) {
            const msg = msgs.find((m) => m.id === messageId);
            if (msg) {
              msg.content += chunk;
            }
          }
        });
      },

      setLoading: (loading) => {
        set((state) => {
          state.isLoading = loading;
        });
      },

      setSidebarOpen: (open) => {
        set((state) => {
          state.sidebarOpen = open;
        });
      },

      getSessionMessages: (sessionId) => {
        return get().messages[sessionId] || [];
      },

      clearSession: (sessionId) => {
        set((state) => {
          state.messages[sessionId] = [];
          const session = state.sessions.find((s) => s.id === sessionId);
          if (session) {
            session.messageCount = 0;
            session.preview = '';
          }
        });
      },
    })),
    {
      name: 'agi-chat-store',
      version: 1,
      partialize: (state) => ({
        sessions: state.sessions,
        messages: state.messages,
        sidebarOpen: state.sidebarOpen,
      }),
    },
  ),
);

export { getGreetingTime };
