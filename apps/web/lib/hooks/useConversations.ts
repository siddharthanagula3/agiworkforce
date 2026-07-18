'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useChatStore, type Conversation, type Message } from '@shared/stores/web-chat-store';
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  ManagedCloudConversationListResponseSchema,
  ManagedCloudConversationResponseSchema,
  ManagedCloudCreateConversationResponseSchema,
  ManagedCloudDeleteConversationResponseSchema,
  ManagedCloudUpdateConversationRequestSchema,
  ManagedCloudUpdateConversationResponseSchema,
  managedCloudConversationPath,
  normalizeManagedCloudConversation,
} from '@agiworkforce/cloud-contracts';

const CONVERSATIONS_PAGE_SIZE = 50;
const PROJECT_CONVERSATIONS_PAGE_SIZE = 100;

function useConversationAuthHeaders() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const getAuthHeaders = useCallback(async () => {
    if (!isLoaded) {
      throw new Error('Authentication is still loading');
    }
    if (!isSignedIn) {
      throw new Error('Not authenticated');
    }
    const token = await getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }, [getToken, isLoaded, isSignedIn]);

  return { getAuthHeaders, isLoaded, isSignedIn };
}

function toWebConversation(
  wire: Parameters<typeof normalizeManagedCloudConversation>[0],
): Conversation {
  const conversation = normalizeManagedCloudConversation(wire);
  return {
    id: conversation.id,
    title: conversation.title,
    model: conversation.model ?? null,
    projectId: conversation.projectId,
    isPinned: conversation.pinned,
    isStarred: conversation.starred,
    isArchived: conversation.archived,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

interface UseConversationsReturn {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  error: string | null;
  // Pagination: the sidebar list is fetched a page at a time (50 rows) so
  // conversations beyond the most-recent page stay reachable via loadMore.
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
  // Actions
  fetchConversations: () => Promise<void>;
  loadMoreConversations: () => Promise<void>;
  createConversation: (
    title?: string,
    model?: string,
    projectId?: string | null,
  ) => Promise<Conversation | null>;
  loadConversation: (id: string) => Promise<boolean>;
  updateConversation: (
    id: string,
    updates: {
      title?: string;
      model?: string;
      projectId?: string | null;
      pinned?: boolean;
      starred?: boolean;
      archived?: boolean;
    },
  ) => Promise<boolean>;
  deleteConversation: (id: string) => Promise<boolean>;
  setActiveConversation: (id: string | null) => void;
}

/**
 * Hook for managing chat conversations
 */
export function useConversations(): UseConversationsReturn {
  const { getAuthHeaders, isLoaded, isSignedIn } = useConversationAuthHeaders();
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const isLoading = useChatStore((state) => state.isLoading);
  const error = useChatStore((state) => state.error);

  const setConversations = useChatStore((state) => state.setConversations);
  const addConversation = useChatStore((state) => state.addConversation);
  const updateConversationInStore = useChatStore((state) => state.updateConversation);
  const deleteConversationFromStore = useChatStore((state) => state.deleteConversation);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const setActiveConversationWithMessages = useChatStore(
    (state) => state.setActiveConversationWithMessages,
  );
  const setMessages = useChatStore((state) => state.setMessages);
  const setLoading = useChatStore((state) => state.setLoading);
  const setError = useChatStore((state) => state.setError);

  // Pagination state for "load more" beyond the first page of conversations.
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const nextOffsetRef = useRef(0);

  // Fetch the first page of conversations (resets pagination state)
  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!isLoaded || !isSignedIn) return;
      const headers = await getAuthHeaders();
      const response = await fetch(
        `/api/chat/conversations?limit=${CONVERSATIONS_PAGE_SIZE}&offset=0`,
        { headers },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to fetch conversations');
      }

      const data = ManagedCloudConversationListResponseSchema.parse(await response.json());
      const conversationList: Conversation[] = data.conversations.map(toWebConversation);

      setConversations(conversationList);
      nextOffsetRef.current = data.nextOffset;
      setHasMoreConversations(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch conversations');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, isLoaded, isSignedIn, setConversations, setLoading, setError]);

  // Fetch the next page and append it to the existing list (deduped by id).
  const loadMoreConversations = useCallback(async () => {
    if (!isLoaded || !isSignedIn || isLoadingMoreConversations || !hasMoreConversations) {
      return;
    }

    setIsLoadingMoreConversations(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const offset = nextOffsetRef.current;
      const response = await fetch(
        `/api/chat/conversations?limit=${CONVERSATIONS_PAGE_SIZE}&offset=${offset}`,
        { headers },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to load more conversations');
      }

      const data = ManagedCloudConversationListResponseSchema.parse(await response.json());
      const newConversations = data.conversations.map(toWebConversation);

      const existingIds = new Set(conversations.map((c) => c.id));
      const deduped = newConversations.filter((c) => !existingIds.has(c.id));
      setConversations([...conversations, ...deduped]);

      nextOffsetRef.current = data.nextOffset;
      setHasMoreConversations(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more conversations');
    } finally {
      setIsLoadingMoreConversations(false);
    }
  }, [
    getAuthHeaders,
    isLoaded,
    isSignedIn,
    isLoadingMoreConversations,
    hasMoreConversations,
    conversations,
    setConversations,
    setError,
  ]);

  // Create a new conversation, optionally scoped to a project (the API stores
  // web_conversations.project_id and echoes it back as projectId).
  const createConversation = useCallback(
    async (
      title?: string,
      model?: string,
      projectId?: string | null,
    ): Promise<Conversation | null> => {
      setLoading(true);
      setError(null);

      try {
        const headers = await addCsrfHeaders(await getAuthHeaders());
        const response = await fetch('/api/chat/conversations', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: title || 'New conversation',
            model,
            ...(projectId ? { projectId } : {}),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || 'Failed to create conversation');
        }

        const data = ManagedCloudCreateConversationResponseSchema.parse(await response.json());
        const conversation = toWebConversation(data.conversation);

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
    async (id: string): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        const headers = await getAuthHeaders();
        const response = await fetch(managedCloudConversationPath(id), { headers });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || 'Failed to load conversation');
        }

        const data = ManagedCloudConversationResponseSchema.parse(await response.json());
        const loadedConversation = toWebConversation(data.conversation);
        updateConversationInStore(id, {
          title: loadedConversation.title,
          model: loadedConversation.model,
          projectId: loadedConversation.projectId,
          isPinned: loadedConversation.isPinned,
          updatedAt: loadedConversation.updatedAt,
        });

        // Convert API messages to store format
        const messages: Message[] = data.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
          model: m.model ?? undefined,
          metadata: (m.metadata ?? undefined) as Message['metadata'],
        }));

        // Atomically set active conversation and messages to avoid race conditions
        setActiveConversationWithMessages(id, messages);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [
      getAuthHeaders,
      updateConversationInStore,
      setActiveConversationWithMessages,
      setLoading,
      setError,
    ],
  );

  // Update a conversation - returns true on success
  const updateConversation = useCallback(
    async (
      id: string,
      updates: {
        title?: string;
        model?: string;
        projectId?: string | null;
        pinned?: boolean;
        starred?: boolean;
        archived?: boolean;
      },
    ): Promise<boolean> => {
      try {
        const headers = await addCsrfHeaders(await getAuthHeaders());
        const response = await fetch(managedCloudConversationPath(id), {
          method: 'PUT',
          headers,
          body: JSON.stringify(ManagedCloudUpdateConversationRequestSchema.parse(updates)),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || 'Failed to update conversation');
        }

        const data = ManagedCloudUpdateConversationResponseSchema.parse(await response.json());
        updateConversationInStore(id, {
          title: data.conversation.title ?? 'Untitled',
          model: data.conversation.model ?? undefined,
          projectId: data.conversation.project_id ?? null,
          isPinned: data.conversation.pinned ?? false,
          isStarred: data.conversation.starred ?? false,
          isArchived: data.conversation.archived ?? false,
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
        const headers = await addCsrfHeaders(await getAuthHeaders());
        const response = await fetch(managedCloudConversationPath(id), {
          method: 'DELETE',
          headers,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || 'Failed to delete conversation');
        }

        ManagedCloudDeleteConversationResponseSchema.parse(await response.json());

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
    if (!isLoaded || !isSignedIn) return;
    fetchConversations();
  }, [fetchConversations, isLoaded, isSignedIn]);

  return {
    conversations,
    activeConversationId,
    isLoading,
    error,
    hasMoreConversations,
    isLoadingMoreConversations,
    fetchConversations,
    loadMoreConversations,
    createConversation,
    loadConversation,
    updateConversation,
    deleteConversation,
    setActiveConversation,
  };
}

interface UseProjectConversationsReturn {
  conversations: Conversation[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  retry: () => Promise<void>;
  loadMore: () => Promise<void>;
}

/**
 * Project-detail conversation reader. It uses the same authenticated API and
 * wire schema as the sidebar without replacing the sidebar's global store with
 * a project-filtered subset.
 */
export function useProjectConversations(
  projectId: string | undefined,
): UseProjectConversationsReturn {
  const { getAuthHeaders, isLoaded, isSignedIn } = useConversationAuthHeaders();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const nextOffsetRef = useRef(0);
  const requestVersionRef = useRef(0);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!projectId || !isLoaded || !isSignedIn) {
        if (!projectId || (isLoaded && !isSignedIn)) setIsLoading(false);
        return;
      }

      const requestVersion = ++requestVersionRef.current;
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      try {
        const headers = await getAuthHeaders();
        const response = await fetch(
          `/api/chat/conversations?projectId=${encodeURIComponent(projectId)}&limit=${PROJECT_CONVERSATIONS_PAGE_SIZE}&offset=${offset}`,
          { headers },
        );
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || 'Failed to fetch project chats');
        }

        const data = ManagedCloudConversationListResponseSchema.parse(await response.json());
        if (requestVersion !== requestVersionRef.current) return;
        const page = data.conversations.map(toWebConversation);
        setConversations((current) => {
          if (!append) return page;
          const existingIds = new Set(current.map((conversation) => conversation.id));
          return [...current, ...page.filter((conversation) => !existingIds.has(conversation.id))];
        });
        nextOffsetRef.current = data.nextOffset;
        setHasMore(data.hasMore);
      } catch (caught) {
        if (requestVersion !== requestVersionRef.current) return;
        setError(caught instanceof Error ? caught.message : 'Failed to fetch project chats');
        if (!append) {
          setConversations([]);
          setHasMore(false);
        }
      } finally {
        if (requestVersion === requestVersionRef.current) {
          if (append) {
            setIsLoadingMore(false);
          } else {
            setIsLoading(false);
          }
        }
      }
    },
    [getAuthHeaders, isLoaded, isSignedIn, projectId],
  );

  const retry = useCallback(async () => fetchPage(0, false), [fetchPage]);
  const loadMore = useCallback(async () => fetchPage(nextOffsetRef.current, true), [fetchPage]);

  useEffect(() => {
    requestVersionRef.current += 1;
    setConversations([]);
    setError(null);
    setHasMore(false);
    setIsLoading(Boolean(projectId));
    nextOffsetRef.current = 0;
    void retry();
  }, [projectId, retry]);

  return { conversations, isLoading, error, hasMore, isLoadingMore, retry, loadMore };
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
      groups['Today']!.push(conversation);
    } else if (updatedAt >= yesterday) {
      groups['Yesterday']!.push(conversation);
    } else if (updatedAt >= sevenDaysAgo) {
      groups['Previous 7 Days']!.push(conversation);
    } else if (updatedAt >= thirtyDaysAgo) {
      groups['Previous 30 Days']!.push(conversation);
    } else {
      groups['Older']!.push(conversation);
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
