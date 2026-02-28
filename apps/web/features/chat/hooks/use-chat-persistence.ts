/**
 * Chat Persistence Hook
 * Manages database integration for multi-agent chat sessions
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@shared/lib/supabase-client';
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
  const _activeChatSession = useMissionStore((state) => state.activeChatSession);

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
      // Load session metadata
      const { data: sessionData, error: sessionError } = await supabase
        .from('web_conversations')
        .select('*')
        .eq('id', sid)
        .maybeSingle();

      if (sessionError) throw sessionError;
      if (!sessionData) {
        throw new Error('Session not found');
      }

      const sd = sessionData as Record<string, unknown>;
      const session: ChatSession = {
        id: sd.id as string,
        userId: sd.user_id as string,
        title: (sd.title as string) ?? 'Untitled',
        mode: (sd.mode as ChatSession['mode']) || 'chat',
        createdAt: new Date((sd.created_at as string) ?? Date.now()),
        updatedAt: new Date((sd.updated_at as string) ?? Date.now()),
        metadata: (sd.metadata as ChatSession['metadata']) ?? {
          messageCount: 0,
          agentsInvolved: [],
          lastActivity: new Date(),
        },
      };

      setCurrentSession(session);

      // Load messages
      const { data: messagesData, error: messagesError } = await supabase
        .from('web_messages')
        .select('*')
        .eq('conversation_id', sid)
        .order('created_at', { ascending: true });

      if (messagesError) throw messagesError;

      // Restore messages to mission store
      if (messagesData && messagesData.length > 0) {
        const restoredMessages = messagesData.map((rawMsg) => {
          const msg = rawMsg as Record<string, unknown>;
          const md = msg.metadata as Record<string, unknown> | undefined;
          return {
            id: msg.id as string,
            from: (md?.from as string) || (msg.role === 'user' ? 'user' : 'assistant'),
            type:
              (md?.type as string) ||
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
            content: msg.content as string,
            timestamp: new Date((msg.created_at as string) ?? Date.now()),
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
  const saveMessages = useCallback(async () => {
    if (!currentSession || messages.length === 0) return;

    setIsSaving(true);

    try {
      // Prepare messages for database
      const messagesToSave = messages.map((msg) => ({
        conversation_id: currentSession.id,
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content,
        metadata: {
          from: msg.from,
          type: msg.type,
          ...msg.metadata,
        },
      }));

      // Use upsert to avoid duplicates
      const { error: saveError } = await supabase
        .from('web_messages')
        .upsert(messagesToSave as never[], { onConflict: 'id' });

      if (saveError) throw saveError;

      // Update session metadata
      // activeEmployees is now a Record, not a Map
      const agentsInvolved = Array.from(
        new Set(Object.keys(activeEmployees).concat(currentSession.metadata.agentsInvolved || [])),
      );

      const { error: updateError } = await (supabase.from('web_conversations') as any)
        .update({
          metadata: {
            messageCount: messages.length,
            agentsInvolved,
            lastActivity: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentSession.id);

      if (updateError) throw updateError;

      setLastSyncedAt(new Date());
    } catch (err) {
      console.error('Failed to save messages:', err);
      // Don't show toast for auto-save failures
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
        const { data, error: createError } = await supabase
          .from('web_conversations')
          .insert([
            {
              user_id: uid,
              title,
              mode,
              metadata: {
                messageCount: 0,
                agentsInvolved: [],
                lastActivity: new Date().toISOString(),
              },
            },
          ] as never)
          .select()
          .single();

        if (createError) throw createError;

        const d = data as Record<string, unknown>;
        const newSession: ChatSession = {
          id: d.id as string,
          userId: d.user_id as string,
          title: (d.title as string) ?? 'Untitled',
          mode: (d.mode as ChatSession['mode']) || 'chat',
          createdAt: new Date((d.created_at as string) ?? Date.now()),
          updatedAt: new Date((d.updated_at as string) ?? Date.now()),
          metadata: (d.metadata as ChatSession['metadata']) ?? {
            messageCount: 0,
            agentsInvolved: [],
            lastActivity: new Date(),
          },
        };

        setCurrentSession(newSession);
        toast.success('Chat session created');

        return d.id as string;
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
        const { error: updateError } = await (supabase.from('web_conversations') as any)
          .update({ title, updated_at: new Date().toISOString() })
          .eq('id', currentSession.id);

        if (updateError) throw updateError;

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
        // Delete messages first
        const { error: messagesError } = await supabase
          .from('web_messages')
          .delete()
          .eq('conversation_id', sid);

        if (messagesError) throw messagesError;

        // Delete session
        const { error: sessionError } = await supabase
          .from('web_conversations')
          .delete()
          .eq('id', sid);

        if (sessionError) throw sessionError;

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
  const getRecentSessions = useCallback(async (uid: string, limit = 10): Promise<ChatSession[]> => {
    try {
      const { data, error } = await supabase
        .from('web_conversations')
        .select('*')
        .eq('user_id', uid)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data.map((rawSession) => {
        const session = rawSession as Record<string, unknown>;
        return {
          id: session.id as string,
          userId: session.user_id as string,
          title: (session.title as string) ?? 'Untitled',
          mode: (session.mode as ChatSession['mode']) || 'chat',
          createdAt: new Date((session.created_at as string) ?? Date.now()),
          updatedAt: new Date((session.updated_at as string) ?? Date.now()),
          metadata: (session.metadata as ChatSession['metadata']) ?? {
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
  }, []);

  // Search sessions
  const searchSessions = useCallback(async (uid: string, query: string): Promise<ChatSession[]> => {
    try {
      const { data, error } = await supabase
        .from('web_conversations')
        .select('*')
        .eq('user_id', uid)
        .ilike('title', `%${query}%`)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return data.map((rawSession) => {
        const session = rawSession as Record<string, unknown>;
        return {
          id: session.id as string,
          userId: session.user_id as string,
          title: (session.title as string) ?? 'Untitled',
          mode: (session.mode as ChatSession['mode']) || 'chat',
          createdAt: new Date((session.created_at as string) ?? Date.now()),
          updatedAt: new Date((session.updated_at as string) ?? Date.now()),
          metadata: (session.metadata as ChatSession['metadata']) ?? {
            messageCount: 0,
            agentsInvolved: [],
            lastActivity: new Date(),
          },
        };
      });
    } catch (err) {
      console.error('Failed to search sessions:', err);
      return [];
    }
  }, []);

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
