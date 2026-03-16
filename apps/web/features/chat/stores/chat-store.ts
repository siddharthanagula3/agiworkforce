import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import { supabase } from '@shared/lib/supabase-client';

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
    tools?: Array<{
      name: string;
      status: 'running' | 'completed' | 'failed';
      durationMs?: number;
      args?: string;
    }>;
  };
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  preview: string;
  messageCount: number;
  userId?: string;
  isPinned?: boolean;
  isArchived?: boolean;
}

interface ChatState {
  sessions: ChatSession[];
  messages: Record<string, ChatMessage[]>;
  activeSessionId: string | null;
  isLoading: boolean;
  sidebarOpen: boolean;
  dbLoaded: boolean;
}

interface ChatActions {
  createSession: (userId?: string) => string;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
  pinSession: (sessionId: string) => void;
  unpinSession: (sessionId: string) => void;
  archiveSession: (sessionId: string) => void;
  unarchiveSession: (sessionId: string) => void;
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
  loadSessionsFromDb: (userId: string) => Promise<void>;
  loadMessagesFromDb: (sessionId: string) => Promise<void>;
  saveMessageToDb: (message: ChatMessage, userId: string) => Promise<void>;
  saveSessionToDb: (session: ChatSession, userId: string) => Promise<void>;
  reset: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
  return crypto.randomUUID();
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

// Guard against rapid duplicate session creation (e.g., double-click on "New Chat")
let lastSessionCreatedAt = 0;
let lastSessionCreatedId: string | null = null;

export const useChatStore = create<ChatState & ChatActions>()(
  persist(
    immer((set, get) => ({
      // State
      sessions: [],
      messages: {},
      activeSessionId: null,
      isLoading: false,
      sidebarOpen: true,
      dbLoaded: false,

      // Actions
      createSession: (userId?: string) => {
        const now = Date.now();
        // Prevent duplicate session creation within 500ms (e.g., rapid "New Chat" clicks,
        // or createSession called from both "New Chat" button and send handler)
        if (now - lastSessionCreatedAt < 500 && lastSessionCreatedId) {
          // Return the recently-created session instead of making a duplicate
          return lastSessionCreatedId;
        }
        lastSessionCreatedAt = now;

        const id = generateId();
        const nowDate = new Date();
        const session: ChatSession = {
          id,
          title: 'New Chat',
          createdAt: nowDate,
          updatedAt: nowDate,
          preview: '',
          messageCount: 0,
          userId,
        };
        set((state) => {
          state.sessions.unshift(session);
          state.messages[id] = [];
          state.activeSessionId = id;
        });
        lastSessionCreatedId = id;
        // Fire-and-forget DB save
        if (userId) {
          get()
            .saveSessionToDb(session, userId)
            .catch(() => {});
        }
        return id;
      },

      deleteSession: (sessionId) => {
        if (lastSessionCreatedId === sessionId) {
          lastSessionCreatedId = null;
        }
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

      pinSession: (sessionId) => {
        set((state) => {
          const session = state.sessions.find((s) => s.id === sessionId);
          if (session) session.isPinned = true;
        });
      },

      unpinSession: (sessionId) => {
        set((state) => {
          const session = state.sessions.find((s) => s.id === sessionId);
          if (session) session.isPinned = false;
        });
      },

      archiveSession: (sessionId) => {
        set((state) => {
          const session = state.sessions.find((s) => s.id === sessionId);
          if (session) {
            session.isArchived = true;
            session.isPinned = false;
          }
        });
      },

      unarchiveSession: (sessionId) => {
        set((state) => {
          const session = state.sessions.find((s) => s.id === sessionId);
          if (session) session.isArchived = false;
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

      reset: () => {
        set((state) => {
          state.sessions = [];
          state.messages = {};
          state.activeSessionId = null;
          state.isLoading = false;
          state.sidebarOpen = true;
          state.dbLoaded = false;
        });
      },

      // ========================================================================
      // Supabase Persistence
      // ========================================================================

      loadSessionsFromDb: async (userId: string) => {
        try {
          const { data, error } = await supabase
            .from('vibe_sessions')
            .select('*')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });

          if (error) {
            console.error('[ChatStore] Failed to load sessions from DB:', error);
            return;
          }

          if (data && data.length > 0) {
            const dbSessions: ChatSession[] = data.map((row: Record<string, unknown>) => ({
              id: row['id'] as string,
              title: (row['title'] as string) || 'Untitled',
              createdAt: new Date(row['created_at'] as string),
              updatedAt: new Date(row['updated_at'] as string),
              preview: (row['preview'] as string) || '',
              messageCount: (row['message_count'] as number) || 0,
              userId: row['user_id'] as string,
              isPinned: (row['is_pinned'] as boolean) || false,
              isArchived: (row['is_archived'] as boolean) || false,
            }));

            set((state) => {
              // Merge: DB sessions take priority, keep any local-only sessions, sort by recency
              const dbIds = new Set(dbSessions.map((s) => s.id));
              const localOnly = state.sessions.filter((s) => !dbIds.has(s.id));
              state.sessions = [...dbSessions, ...localOnly].sort(
                (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
              );
              state.dbLoaded = true;
            });
          } else {
            set((state) => {
              state.dbLoaded = true;
            });
          }
        } catch (err) {
          console.error('[ChatStore] DB session load error:', err);
          set((state) => {
            state.dbLoaded = true;
          });
        }
      },

      loadMessagesFromDb: async (sessionId: string) => {
        try {
          const { data, error } = await supabase
            .from('vibe_messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('timestamp', { ascending: true });

          if (error) {
            console.error('[ChatStore] Failed to load messages from DB:', error);
            return;
          }

          if (data && data.length > 0) {
            const dbMessages: ChatMessage[] = data.map((row: Record<string, unknown>) => ({
              id: row['id'] as string,
              sessionId: row['session_id'] as string,
              role: row['role'] as 'user' | 'assistant',
              content: (row['content'] as string) || '',
              createdAt: row['timestamp']
                ? new Date(row['timestamp'] as string)
                : row['created_at']
                  ? new Date(row['created_at'] as string)
                  : new Date(),
              isStreaming: false,
              metadata:
                typeof row['metadata'] === 'object' && row['metadata'] !== null
                  ? (row['metadata'] as ChatMessage['metadata'])
                  : undefined,
            }));

            set((state) => {
              state.messages[sessionId] = dbMessages;
            });
          }
        } catch (err) {
          console.error('[ChatStore] DB message load error:', err);
        }
      },

      saveMessageToDb: async (message: ChatMessage, userId: string) => {
        try {
          await (
            supabase.from('vibe_messages') as unknown as ReturnType<typeof supabase.from>
          ).upsert({
            id: message.id,
            session_id: message.sessionId,
            user_id: userId,
            role: message.role,
            content: message.content,
            metadata: message.metadata || {},
            is_streaming: false,
          });
        } catch (err) {
          console.error('[ChatStore] Failed to save message to DB:', err);
        }
      },

      saveSessionToDb: async (session: ChatSession, userId: string) => {
        try {
          await (
            supabase.from('vibe_sessions') as unknown as ReturnType<typeof supabase.from>
          ).upsert({
            id: session.id,
            user_id: userId,
            title: session.title,
            preview: session.preview,
            message_count: session.messageCount,
            created_at: session.createdAt.toISOString(),
            updated_at: session.updatedAt.toISOString(),
            is_pinned: session.isPinned ?? false,
            is_archived: session.isArchived ?? false,
          });
        } catch (err) {
          console.error('[ChatStore] Failed to save session to DB:', err);
        }
      },
    })),
    {
      name: 'agi-chat-store',
      version: 1,
      partialize: (state) => ({
        sessions: state.sessions,
        messages: state.messages,
        sidebarOpen: state.sidebarOpen,
        dbLoaded: false, // Always reset on rehydration so we re-fetch
      }),
    },
  ),
);

export { getGreetingTime };
