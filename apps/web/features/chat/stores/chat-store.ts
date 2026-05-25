import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import type { ArtifactManifest, ComputeSession, GeneratedFile } from '@agiworkforce/types';
import {
  ConversationSyncService,
  type SyncedConversation,
  type SyncStatus,
} from '@/lib/conversationSync';

// ============================================================================
// Types
// ============================================================================

export interface ThinkingSegment {
  /** Stable React key */
  id: string;
  /** Raw thinking text accumulated from streaming deltas */
  content: string;
  /** True while this segment is actively receiving tokens */
  isStreaming: boolean;
  /** ISO timestamp when this segment's thinking started */
  startedAt: string;
  /** ISO timestamp when this segment's thinking completed (null while streaming) */
  completedAt: string | null;
  /** Duration in seconds, derived from start/complete timestamps */
  durationSeconds?: number;
}

/**
 * Web chat store message shape.
 *
 * Surface-specific extension of the canonical ChatMessage from
 * `@agiworkforce/types`. Key differences from canonical:
 *   - `sessionId` maps to `conversationId` in the canonical type
 *   - `createdAt` is a `Date` object (canonical uses ISO 8601 string)
 *   - `metadata` is typed explicitly for streaming/thinking UI state
 *
 * When serialising to the API or canonical layer, map these fields
 * accordingly.
 */
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
      id?: string;
      name: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      durationMs?: number;
      args?: string;
      parameters?: Record<string, unknown>;
      parallelGroup?: string;
      error?: string;
    }>;
    /** Raw extended thinking text accumulated from streaming deltas */
    thinkingContent?: string;
    /** True while thinking tokens are actively being received */
    isThinkingStreaming?: boolean;
    /** ISO timestamp when thinking started (first thinking token received) */
    thinkingStartedAt?: string;
    /** ISO timestamp when thinking completed (thinking block closed) */
    thinkingCompletedAt?: string;
    /** Duration of thinking phase in seconds */
    thinkingDurationSeconds?: number;
    /** Multi-segment thinking blocks (interleaved reasoning) */
    thinkingSegments?: ThinkingSegment[];
    /** True while a server-managed web search is in progress */
    isSearching?: boolean;
    /** Web search results from server-managed tools */
    searchResults?: Array<{ url: string; title: string; snippet: string }>;
    /** True while server-managed code execution is running */
    isExecutingCode?: boolean;
    /** Code execution result from server-managed code_execution_20260120 tool */
    codeExecutionResult?: {
      stdout: string;
      stderr: string;
      returnCode: number;
      images?: Array<{ mediaType: string; data: string }>;
    };
    /** Generated-file provenance for artifact workbench rendering. */
    computeSession?: ComputeSession;
    generatedFile?: GeneratedFile;
    artifactManifest?: ArtifactManifest;
    documentData?: { title?: string; content?: string; [key: string]: unknown };
    /** Persisted user reaction (loaded from Supabase messages.metadata on conversation load) */
    reaction?: 'thumbsUp' | 'thumbsDown' | null;
    /**
     * A/B comparison options for a message. When present, the message slot renders
     * ComparisonResponse instead of the standard MarkdownContent.
     * TODO: LLM-side A/B generation not yet wired; UI ready for when it lands.
     * See apps/web/features/chat/services/chat-ai-service.ts for the call site.
     */
    comparisonOptions?: {
      a: { label?: string; content: string };
      b: { label?: string; content: string };
    };
    /** Which comparison option the user selected ('a' | 'b'). Null means not yet chosen. */
    comparisonChoice?: 'a' | 'b';
    /**
     * Paywall gate payload — set when the API returns { kind: 'paywall', ... }
     * with HTTP 402. When present, the message slot renders InlinePaywallCard
     * instead of MessageBubble.
     */
    paywall?: {
      feature:
        | 'video_generation'
        | 'opus_4_7'
        | 'gpt_5_5'
        | 'computer_use'
        | 'deep_research'
        | 'image_quota'
        | 'token_cap'
        | 'mcp'
        | 'web_search';
      requiredTier: 'hobby' | 'pro' | 'max';
      reason?: string;
    };
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
  /** Project this session belongs to (client-side only; not persisted to vibe_sessions). */
  projectId?: string | null;
}

interface ChatState {
  sessions: ChatSession[];
  messages: Record<string, ChatMessage[]>;
  activeSessionId: string | null;
  isLoading: boolean;
  /** True while the SSE stream for the active response is in-flight. */
  isGenerating: boolean;
  sidebarOpen: boolean;
  dbLoaded: boolean;
  /** Cross-device sync status: idle | syncing | synced | error */
  syncStatus: SyncStatus;
}

interface ChatActions {
  createSession: (userId?: string) => string;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, title: string) => void;
  pinSession: (sessionId: string) => void;
  unpinSession: (sessionId: string) => void;
  archiveSession: (sessionId: string) => void;
  unarchiveSession: (sessionId: string) => void;
  moveToProject: (sessionId: string, projectId: string | null) => void;
  setActiveSession: (sessionId: string | null) => void;
  addMessage: (
    sessionId: string,
    message: Omit<ChatMessage, 'id' | 'createdAt' | 'sessionId'>,
  ) => string;
  updateMessage: (sessionId: string, messageId: string, content: string) => void;
  deleteMessage: (sessionId: string, messageId: string) => void;
  setStreaming: (sessionId: string, messageId: string, streaming: boolean) => void;
  appendToMessage: (sessionId: string, messageId: string, chunk: string) => void;
  /** Record the user's A/B comparison choice for a message */
  setComparisonChoice: (sessionId: string, messageId: string, choice: 'a' | 'b') => void;
  /** Mark thinking as started for a message, recording the start timestamp */
  startThinking: (sessionId: string, messageId: string) => void;
  /** Append a thinking content delta to the specified message */
  appendThinkingContent: (sessionId: string, messageId: string, delta: string) => void;
  /** Mark thinking as completed, recording end timestamp and computing duration */
  completeThinking: (sessionId: string, messageId: string) => void;
  setLoading: (loading: boolean) => void;
  /** Set whether an SSE stream is actively generating output. */
  setGenerating: (generating: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  getSessionMessages: (sessionId: string) => ChatMessage[];
  clearSession: (sessionId: string) => void;
  loadSessionsFromDb: (userId: string) => Promise<void>;
  loadMessagesFromDb: (sessionId: string) => Promise<void>;
  saveMessageToDb: (message: ChatMessage, userId: string) => Promise<void>;
  saveSessionToDb: (session: ChatSession, userId: string) => Promise<void>;
  /** Perform cross-device conversation sync via ConversationSyncService */
  syncWithRemote: (userId: string) => Promise<void>;
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

// Singleton sync service for cross-device conversation sync
const conversationSync = new ConversationSyncService(null, 'web');

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
      isGenerating: false,
      sidebarOpen: true,
      dbLoaded: false,
      syncStatus: 'idle' as SyncStatus,

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
            .catch((e: unknown) => {
              console.error('[ChatStore] Failed to save session to DB:', e);
            });
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

      moveToProject: (sessionId, projectId) => {
        set((state) => {
          const session = state.sessions.find((s) => s.id === sessionId);
          if (session) session.projectId = projectId;
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

      setComparisonChoice: (sessionId, messageId, choice) => {
        set((state) => {
          const msgs = state.messages[sessionId];
          if (msgs) {
            const msg = msgs.find((m) => m.id === messageId);
            if (msg) {
              if (!msg.metadata) msg.metadata = {};
              msg.metadata.comparisonChoice = choice;
            }
          }
        });
      },

      startThinking: (sessionId, messageId) => {
        set((state) => {
          const msgs = state.messages[sessionId];
          if (msgs) {
            const msg = msgs.find((m) => m.id === messageId);
            if (msg) {
              if (!msg.metadata) msg.metadata = {};
              msg.metadata.isThinkingStreaming = true;
              msg.metadata.thinkingStartedAt = new Date().toISOString();
              msg.metadata.thinkingContent = msg.metadata.thinkingContent ?? '';
            }
          }
        });
      },

      appendThinkingContent: (sessionId, messageId, delta) => {
        set((state) => {
          const msgs = state.messages[sessionId];
          if (msgs) {
            const msg = msgs.find((m) => m.id === messageId);
            if (msg) {
              if (!msg.metadata) msg.metadata = {};
              msg.metadata.thinkingContent = (msg.metadata.thinkingContent ?? '') + delta;
            }
          }
        });
      },

      completeThinking: (sessionId, messageId) => {
        set((state) => {
          const msgs = state.messages[sessionId];
          if (msgs) {
            const msg = msgs.find((m) => m.id === messageId);
            if (msg) {
              if (!msg.metadata) msg.metadata = {};
              const completedAt = new Date().toISOString();
              msg.metadata.isThinkingStreaming = false;
              msg.metadata.thinkingCompletedAt = completedAt;
              if (msg.metadata.thinkingStartedAt) {
                const durationMs =
                  new Date(completedAt).getTime() -
                  new Date(msg.metadata.thinkingStartedAt).getTime();
                msg.metadata.thinkingDurationSeconds = Math.round(durationMs / 1000);
              }
            }
          }
        });
      },

      setLoading: (loading) => {
        set((state) => {
          state.isLoading = loading;
        });
      },

      setGenerating: (generating) => {
        set((state) => {
          state.isGenerating = generating;
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

      syncWithRemote: async (userId: string) => {
        set((state) => {
          state.syncStatus = 'syncing';
        });
        try {
          const localSessions = get().sessions;
          const localAsSynced: SyncedConversation[] = localSessions.map((s) => ({
            id: s.id,
            user_id: userId,
            title: s.title,
            model: null,
            is_active: !s.isArchived,
            synced_from: 'web' as const,
            metadata: null,
            created_at:
              s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
            updated_at:
              s.updatedAt instanceof Date ? s.updatedAt.toISOString() : String(s.updatedAt),
            deleted_at: null,
          }));

          const merged = await conversationSync.fullSync(localAsSynced);

          set((state) => {
            // Merge remote-only sessions into local state
            const localIds = new Set(state.sessions.map((s) => s.id));
            for (const remote of merged) {
              if (!localIds.has(remote.id)) {
                state.sessions.push({
                  id: remote.id,
                  title: remote.title || 'Synced Chat',
                  createdAt: new Date(remote.created_at),
                  updatedAt: new Date(remote.updated_at || remote.created_at),
                  preview: '',
                  messageCount: 0,
                  userId: remote.user_id,
                  isPinned: false,
                  isArchived: remote.is_active === false,
                });
              }
            }
            state.sessions.sort(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
            );
            state.syncStatus = 'synced';
          });
        } catch {
          set((state) => {
            state.syncStatus = 'error';
          });
        }
      },

      reset: () => {
        set((state) => {
          state.sessions = [];
          state.messages = {};
          state.activeSessionId = null;
          state.isLoading = false;
          state.isGenerating = false;
          state.sidebarOpen = true;
          state.dbLoaded = false;
          state.syncStatus = 'idle';
        });
      },

      // ========================================================================
      // Persistence (vibe_sessions / vibe_messages)
      // TODO: Add /api/chat/sessions and /api/chat/sessions/[id]/messages routes
      // for vibe_sessions/vibe_messages persistence (schema differs from web_conversations).
      // ========================================================================

      loadSessionsFromDb: async (_userId: string) => {
        // TODO: Fetch from /api/chat/sessions once route is added.
        set((state) => {
          state.dbLoaded = true;
        });
      },

      loadMessagesFromDb: async (_sessionId: string) => {
        // TODO: Fetch from /api/chat/sessions/[id]/messages once route is added.
      },

      saveMessageToDb: async (_message: ChatMessage, _userId: string) => {
        // TODO: POST to /api/chat/sessions/[id]/messages once route is added.
      },

      saveSessionToDb: async (_session: ChatSession, _userId: string) => {
        // TODO: POST/PUT to /api/chat/sessions once route is added.
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
        syncStatus: 'idle' as SyncStatus, // Always reset on rehydration
      }),
    },
  ),
);

export { getGreetingTime };
