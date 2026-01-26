'use client';

import { useCallback, useEffect } from 'react';
import { useChatStore, type Conversation, type Message } from '@/stores/chatStore';
import { getSupabaseClient } from '@/services/supabase';

// API response types
interface ApiConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ApiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  model?: string;
}

interface UseConversationsReturn {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  error: string | null;
  // Actions
  fetchConversations: () => Promise<void>;
  createConversation: (title?: string, model?: string) => Promise<Conversation | null>;
  loadConversation: (id: string) => Promise<void>;
  updateConversation: (id: string, updates: { title?: string; model?: string }) => Promise<boolean>;
  deleteConversation: (id: string) => Promise<boolean>;
  setActiveConversation: (id: string | null) => void;
}

/**
 * Hook for managing chat conversations
 */
export function useConversations(): UseConversationsReturn {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const isLoading = useChatStore((state) => state.isLoading);
  const error = useChatStore((state) => state.error);

  const setConversations = useChatStore((state) => state.setConversations);
  const addConversation = useChatStore((state) => state.addConversation);
  const updateConversationInStore = useChatStore((state) => state.updateConversation);
  const deleteConversationFromStore = useChatStore((state) => state.deleteConversation);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const setMessages = useChatStore((state) => state.setMessages);
  const setLoading = useChatStore((state) => state.setLoading);
  const setError = useChatStore((state) => state.setError);

  // Helper to get auth token
  const getAuthHeaders = useCallback(async () => {
    const supabase = getSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Not authenticated');
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    };
  }, []);

  // Fetch all conversations
  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/chat/conversations', { headers });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to fetch conversations');
      }

      const data = await response.json();
      const conversationList: Conversation[] = (data.conversations || []).map(
        (c: ApiConversation) => ({
          id: c.id,
          title: c.title,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        }),
      );

      setConversations(conversationList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch conversations');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, setConversations, setLoading, setError]);

  // Create a new conversation
  const createConversation = useCallback(
    async (title?: string, model?: string): Promise<Conversation | null> => {
      setLoading(true);
      setError(null);

      try {
        const headers = await getAuthHeaders();
        const response = await fetch('/api/chat/conversations', {
          method: 'POST',
          headers,
          body: JSON.stringify({ title: title || 'New conversation', model }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || 'Failed to create conversation');
        }

        const data = await response.json();
        const conversation: Conversation = {
          id: data.conversation.id,
          title: data.conversation.title,
          createdAt: data.conversation.created_at,
          updatedAt: data.conversation.updated_at,
        };

        addConversation(conversation);
        setActiveConversation(conversation.id);
        setMessages([]);

        return conversation;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create conversation');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [getAuthHeaders, addConversation, setActiveConversation, setMessages, setLoading, setError],
  );

  // Load a conversation with its messages
  const loadConversation = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);

      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`/api/chat/conversations/${id}`, { headers });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || 'Failed to load conversation');
        }

        const data = await response.json();

        // Convert API messages to store format
        const messages: Message[] = (data.messages || []).map((m: ApiMessage) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
          model: m.model,
        }));

        // Only set active conversation after successful load
        setActiveConversation(id);
        setMessages(messages);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
      } finally {
        setLoading(false);
      }
    },
    [getAuthHeaders, setActiveConversation, setMessages, setLoading, setError],
  );

  // Update a conversation - returns true on success
  const updateConversation = useCallback(
    async (id: string, updates: { title?: string; model?: string }): Promise<boolean> => {
      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`/api/chat/conversations/${id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || 'Failed to update conversation');
        }

        const data = await response.json();
        updateConversationInStore(id, {
          title: data.conversation.title,
          updatedAt: data.conversation.updated_at,
        });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update conversation');
        return false;
      }
    },
    [getAuthHeaders, updateConversationInStore, setError],
  );

  // Delete a conversation - returns true on success
  const deleteConversation = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`/api/chat/conversations/${id}`, {
          method: 'DELETE',
          headers,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || 'Failed to delete conversation');
        }

        deleteConversationFromStore(id);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete conversation');
        return false;
      }
    },
    [getAuthHeaders, deleteConversationFromStore, setError],
  );

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    activeConversationId,
    isLoading,
    error,
    fetchConversations,
    createConversation,
    loadConversation,
    updateConversation,
    deleteConversation,
    setActiveConversation,
  };
}

/**
 * Group conversations by date (Today, Yesterday, Previous 7 Days, Older)
 */
export function groupConversationsByDate(
  conversations: Conversation[],
): Record<string, Conversation[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const groups: Record<string, Conversation[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 Days': [],
    'Previous 30 Days': [],
    Older: [],
  };

  for (const conversation of conversations) {
    const updatedAt = new Date(conversation.updatedAt);

    if (updatedAt >= today) {
      groups['Today'].push(conversation);
    } else if (updatedAt >= yesterday) {
      groups['Yesterday'].push(conversation);
    } else if (updatedAt >= sevenDaysAgo) {
      groups['Previous 7 Days'].push(conversation);
    } else if (updatedAt >= thirtyDaysAgo) {
      groups['Previous 30 Days'].push(conversation);
    } else {
      groups['Older'].push(conversation);
    }
  }

  // Remove empty groups
  const filteredGroups: Record<string, Conversation[]> = {};
  for (const [key, value] of Object.entries(groups)) {
    if (value.length > 0) {
      filteredGroups[key] = value;
    }
  }

  return filteredGroups;
}
