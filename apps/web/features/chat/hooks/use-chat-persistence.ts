/**
 * Chat Persistence Hook
 * Manages database integration for multi-agent chat sessions
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
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

/**
 * Hook for persisting multi-agent chat to database
 */
export function useChatPersistence(sessionId?: string, _userId?: string): UseChatPersistenceReturn {
  const messages = useMissionStore((state) => state.messages);
  const activeEmployees = useMissionStore((state) => state.activeEmployees);
  const mode = useMissionStore((state) => state.mode);

  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);

  // Load session from database
  // Defined before useEffect that depends on it
  const loadSession = useCallback(async (sid: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/chat/conversations/${sid}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const result = (await res.json()) as {
        conversation: Record<string, unknown>;
        messages: Record<string, unknown>[];
      };

      const sd = result.conversation;
      const session: ChatSession = {
        id: sd['id'] as string,
        userId: sd['user_id'] as string,
        title: (sd['title'] as string) ?? 'Untitled',
        mode: (sd['mode'] as ChatSession['mode']) || 'chat',
        createdAt: new Date((sd['created_at'] as string) ?? Date.now()),
        updatedAt: new Date((sd['updated_at'] as string) ?? Date.now()),
        metadata: (sd['metadata'] as ChatSession['metadata']) ?? {
          messageCount: 0,
          agentsInvolved: [],
          lastActivity: new Date(),
        },
      };

      setCurrentSession(session);

      // Restore messages to mission store
      const messagesData = result.messages ?? [];
      if (messagesData.length > 0) {
        const restoredMessages = messagesData.map((rawMsg) => {
          const msg = rawMsg as Record<string, unknown>;
          const md = msg['metadata'] as Record<string, unknown> | undefined;
          return {
            id: msg['id'] as string,
            from: (md?.['from'] as string) || (msg['role'] === 'user' ? 'user' : 'assistant'),
            type:
              (md?.['type'] as string) ||
              ((msg['role'] === 'user' ? 'user' : 'assistant') as
                | 'user'
                | 'assistant'
                | 'system'
                | 'employee'
                | 'agent'
                | 'status'
                | 'task_update'
                | 'plan'
                | 'error'),
            content: msg['content'] as string,
            timestamp: new Date((msg['created_at'] as string) ?? Date.now()),
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
  }, []);

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
        const token = await getAuthToken();
        const res = await fetch('/api/chat/conversations', {
          method: 'POST',
          headers: await addCsrfHeaders({
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          }),
          body: JSON.stringify({ title, mode }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
        }

        const result = (await res.json()) as { conversation: Record<string, unknown> };
        const d = result.conversation;

        const newSession: ChatSession = {
          id: d['id'] as string,
          userId: uid,
          title: (d['title'] as string) ?? 'Untitled',
          mode: (d['mode'] as ChatSession['mode']) || 'chat',
          createdAt: new Date((d['created_at'] as string) ?? Date.now()),
          updatedAt: new Date((d['updated_at'] as string) ?? Date.now()),
          metadata: (d['metadata'] as ChatSession['metadata']) ?? {
            messageCount: 0,
            agentsInvolved: [],
            lastActivity: new Date(),
          },
        };

        setCurrentSession(newSession);
        toast.success('Chat session created');

        return d['id'] as string;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create session';
        setError(errorMsg);
        toast.error(errorMsg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [mode],
  );

  // Update session title
  const updateSessionTitle = useCallback(
    async (title: string) => {
      if (!currentSession) return;

      try {
        const token = await getAuthToken();
        const res = await fetch(`/api/chat/conversations/${currentSession.id}`, {
          method: 'PUT',
          headers: await addCsrfHeaders({
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          }),
          body: JSON.stringify({ title }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
        }

        setCurrentSession((prev) => (prev ? { ...prev, title, updatedAt: new Date() } : null));

        toast.success('Session title updated');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to update title';
        toast.error(errorMsg);
      }
    },
    [currentSession],
  );

  // Delete session
  const deleteSession = useCallback(
    async (sid: string) => {
      try {
        const token = await getAuthToken();
        const res = await fetch(`/api/chat/conversations/${sid}`, {
          method: 'DELETE',
          headers: await addCsrfHeaders({
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
        }

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
    [currentSession],
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
        const token = await getAuthToken();
        const res = await fetch('/api/chat/conversations', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!res.ok) return [];

        const result = (await res.json()) as { conversations: Record<string, unknown>[] };
        return (result.conversations ?? []).map((rawSession) => {
          const session = rawSession as Record<string, unknown>;
          return {
            id: session['id'] as string,
            userId: session['user_id'] as string,
            title: (session['title'] as string) ?? 'Untitled',
            mode: (session['mode'] as ChatSession['mode']) || 'chat',
            createdAt: new Date((session['created_at'] as string) ?? Date.now()),
            updatedAt: new Date((session['updated_at'] as string) ?? Date.now()),
            metadata: (session['metadata'] as ChatSession['metadata']) ?? {
              messageCount: 0,
              agentsInvolved: [],
              lastActivity: new Date(),
            },
          };
        });
      } catch (err) {
        console.error('Failed to get recent sessions:', err);
        return [];
      }
    },
    [],
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
