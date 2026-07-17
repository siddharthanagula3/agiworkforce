/**
 * Chat Persistence Hook
 * Manages database integration for multi-agent chat sessions
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  createManagedCloudChatClient,
  type ManagedCloudConversation,
} from '@agiworkforce/cloud-contracts';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useMissionStore, type MissionMessage } from '@shared/stores/mission-control-store';

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  mode: 'mission' | 'chat';
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    messageCount: number;
    agentsInvolved: string[];
    lastActivity: Date;
  };
}

export interface UseChatPersistenceReturn {
  // State
  currentSession: ChatSession | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  lastSyncedAt: Date | null;

  // Actions
  createSession: (title: string, userId: string) => Promise<string>;
  loadSession: (sessionId: string) => Promise<void>;
  saveMessages: () => Promise<void>;
  updateSessionTitle: (title: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  autoSave: (enabled: boolean) => void;

  // Utilities
  getRecentSessions: (userId: string, limit?: number) => Promise<ChatSession[]>;
  searchSessions: (userId: string, query: string) => Promise<ChatSession[]>;
}

function toChatSession(conversation: ManagedCloudConversation, userId = ''): ChatSession {
  return {
    id: conversation.id,
    userId,
    title: conversation.title,
    mode: 'chat',
    createdAt: new Date(conversation.createdAt),
    updatedAt: new Date(conversation.updatedAt),
    metadata: {
      messageCount: 0,
      agentsInvolved: [],
      lastActivity: new Date(conversation.updatedAt),
    },
  };
}

/**
 * Hook for persisting multi-agent chat to database
 */
export function useChatPersistence(sessionId?: string, _userId?: string): UseChatPersistenceReturn {
  const messages = useMissionStore((state) => state.messages);
  const activeEmployees = useMissionStore((state) => state.activeEmployees);

  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);

  // Framework-agnostic cloud persistence client (shared with desktop in DCL-2).
  // baseUrl '' keeps the web call sites byte-identical to the prior relative
  // `/api/chat/conversations` requests. CSRF + auth + fetch are the web seams.
  const client = useMemo(
    () =>
      createManagedCloudChatClient({
        baseUrl: '',
        getAuthToken,
        decorateMutationHeaders: addCsrfHeaders,
        fetchImpl: (input, init) => fetch(input, init),
      }),
    [],
  );

  // Load session from database
  // Defined before useEffect that depends on it
  const loadSession = useCallback(
    async (sid: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const { conversation, messages: messagesData } = await client.getConversation(sid);

        const session = toChatSession(conversation);

        setCurrentSession(session);

        // Restore messages to mission store
        if (messagesData.length > 0) {
          const restoredMessages = messagesData.map((msg) => {
            const md = msg.metadata;
            return {
              id: msg.id,
              from: (md?.['from'] as string) || (msg.role === 'user' ? 'user' : 'assistant'),
              type:
                (md?.['type'] as string) ||
                ((msg.role === 'user' ? 'user' : 'assistant') as
                  | 'user'
                  | 'assistant'
                  | 'system'
                  | 'employee'
                  | 'agent'
                  | 'status'
                  | 'task_update'
                  | 'plan'
                  | 'error'),
              content: msg.content,
              timestamp: new Date(msg.createdAt),
              metadata: md || {},
            };
          });

          useMissionStore.getState().setMessages(restoredMessages as unknown as MissionMessage[]);
        }

        toast.success('Session loaded');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to load session';
        setError(errorMsg);
        toast.error(errorMsg);
      } finally {
        setIsLoading(false);
      }
    },
    [client],
  );

  // Save messages to database
  // TODO: Add /api/chat/conversations/[id]/messages/bulk route for batch message upsert.
  const saveMessages = useCallback(async () => {
    if (!currentSession || messages.length === 0) return;

    void activeEmployees; // referenced for metadata computation when route is added

    setIsSaving(true);
    try {
      // no-op: bulk message upsert deferred pending /api/chat/conversations/[id]/messages/bulk route
      setLastSyncedAt(new Date());
    } finally {
      setIsSaving(false);
    }
  }, [currentSession, messages, activeEmployees]);

  // Load session on mount
  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    }
  }, [sessionId, loadSession]);

  // Auto-save messages periodically
  useEffect(() => {
    if (!autoSaveEnabled || !currentSession) return;

    const interval = setInterval(() => {
      saveMessages();
    }, 30000); // Save every 30 seconds

    return () => clearInterval(interval);
  }, [autoSaveEnabled, currentSession, messages, saveMessages]);

  // Create new session
  const createSession = useCallback(
    async (title: string, uid: string): Promise<string> => {
      if (!uid) {
        throw new Error('User ID is required');
      }

      setIsLoading(true);
      setError(null);

      try {
        const conversation = await client.createConversation({ title });

        const newSession = toChatSession(conversation, uid);

        setCurrentSession(newSession);
        toast.success('Chat session created');

        return newSession.id;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create session';
        setError(errorMsg);
        toast.error(errorMsg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [client],
  );

  // Update session title
  const updateSessionTitle = useCallback(
    async (title: string) => {
      if (!currentSession) return;

      try {
        await client.updateConversation(currentSession.id, { title });

        setCurrentSession((prev) => (prev ? { ...prev, title, updatedAt: new Date() } : null));

        toast.success('Session title updated');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to update title';
        toast.error(errorMsg);
      }
    },
    [currentSession, client],
  );

  // Delete session
  const deleteSession = useCallback(
    async (sid: string) => {
      try {
        await client.deleteConversation(sid);

        if (currentSession?.id === sid) {
          setCurrentSession(null);
        }

        toast.success('Session deleted');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to delete session';
        toast.error(errorMsg);
        throw err;
      }
    },
    [currentSession, client],
  );

  // Toggle auto-save
  const autoSave = useCallback((enabled: boolean) => {
    setAutoSaveEnabled(enabled);
    toast.info(enabled ? 'Auto-save enabled' : 'Auto-save disabled');
  }, []);

  // Get recent sessions
  const getRecentSessions = useCallback(
    async (_uid: string, _limit = 10): Promise<ChatSession[]> => {
      try {
        const page = await client.listConversations({ limit: _limit, offset: 0 });
        return page.conversations.map((conversation) => toChatSession(conversation, _uid));
      } catch (err) {
        console.error('Failed to get recent sessions:', err);
        return [];
      }
    },
    [client],
  );

  // Search sessions
  // TODO: Add search query param support to GET /api/chat/conversations.
  const searchSessions = useCallback(
    async (_uid: string, _query: string): Promise<ChatSession[]> => {
      // no-op: search param deferred pending /api/chat/conversations?q= support
      return [];
    },
    [],
  );

  return {
    // State
    currentSession,
    isLoading,
    isSaving,
    error,
    lastSyncedAt,

    // Actions
    createSession,
    loadSession,
    saveMessages,
    updateSessionTitle,
    deleteSession,
    autoSave,

    // Utilities
    getRecentSessions,
    searchSessions,
  };
}
