'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useChatProjectStore } from '@agiworkforce/unified-chat';
import { useChatStore, type Conversation, type Message } from '@shared/stores/web-chat-store';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { readPersistedAttachments } from '@/features/chat/lib/persisted-attachments';
import {
  ManagedCloudConversationListResponseSchema,
  ManagedCloudConversationResponseSchema,
  ManagedCloudCreateConversationResponseSchema,
  ManagedCloudDeleteConversationResponseSchema,
  // PER-33: the real runtime validator for loaded message metadata.
  ManagedCloudMessageMetadataSchema,
  ManagedCloudUpdateConversationRequestSchema,
  ManagedCloudUpdateConversationResponseSchema,
  managedCloudConversationPath,
  normalizeManagedCloudConversation,
} from '@agiworkforce/cloud-contracts';

/**
 * PER-33 — validate loaded message metadata instead of asserting it.
 *
 * Attachments already had a real runtime validator (`readPersistedAttachments`)
 * while the metadata object beside them was taken on trust with a bare
 * `as Message['metadata']`, so a malformed or over-sized row from the API
 * reached the store and every renderer downstream typed as something it was
 * not. The wire schema only checks that metadata is a JSON object; this applies
 * the canonical `ManagedCloudMessageMetadataSchema` (object shape + the size
 * bound the write path enforces).
 *
 * Degrades per message rather than per conversation: a bad row loses its
 * metadata and keeps its text, instead of failing the whole transcript load.
 * The single cast below is on a value zod has already validated at runtime —
 * `MessageMetadata`'s fields are all optional, so the validated
 * `Record<string, unknown>` is a structurally sound source for it.
 */
function readLoadedMessageMetadata(value: unknown): Message['metadata'] {
  if (value === null || value === undefined) return undefined;
  const parsed = ManagedCloudMessageMetadataSchema.safeParse(value);
  if (!parsed.success) {
    console.warn('[useConversations] dropped malformed message metadata', parsed.error.issues);
    return undefined;
  }
  return parsed.data as Message['metadata'];
}

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

/**
 * Wire row → sidebar store shape. Exported because the deleted-chats restore
 * path needs the SAME mapping: a restored conversation has to be added to the
 * store, and a second hand-written mapper is how `isTemporary` got dropped the
 * first time (see the note below).
 */
export function toWebConversation(
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
    // AUDIT-FIX CMP-3: this mapper dropped `isTemporary`, so even once the flag
    // was persisted the UI forgot it on the next load — the store excludes
    // `conversations` from `partialize`, making the server response the only
    // source. Carrying it here is what makes the checkmark survive a reload.
    isTemporary: conversation.isTemporary,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

interface UseConversationsReturn {
  conversations: Conversation[];
  activeConversationId: string | null;
  /**
   * AUDIT-FIX STR-7/BUG-12: conversation CRUD progress (sidebar list fetch,
   * create, open). This is deliberately NOT the chat store's `isLoading`
   * anymore: that flag means "a TURN is in flight" and gates the composer's
   * Stop button and disabled state. Writing it from a sidebar fetch or a
   * `loadConversation` was the actual mechanism behind the reported "Stop
   * button persists when switching chats".
   */
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
      /** AUDIT-FIX CMP-3: temporary-chat privacy flag (persisted server-side). */
      isTemporary?: boolean;
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
  const setError = useChatStore((state) => state.setError);

  // Pagination state for "load more" beyond the first page of conversations.
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const nextOffsetRef = useRef(0);

  /**
   * AUDIT-FIX STR-7/BUG-12: local conversation-CRUD progress. These used to be
   * written into the chat store's turn-scoped `isLoading`, which
   * `ChatComposerNew` reads as `isTurnActive` -- so simply listing or opening a
   * conversation disabled the composer and showed a Stop button for a turn that
   * did not exist.
   */
  const [isFetchingConversations, setIsFetchingConversations] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [isOpeningConversation, setIsOpeningConversation] = useState(false);
  /**
   * AUDIT-FIX STR-13: monotonic request token for `loadConversation`. Rapid
   * A -> B -> C switching used to land whichever response resolved last, with
   * no check that its id was still the one the user wanted. Same
   * `cancelled`-flag shape already used for the handoff-preview effect in
   * WebChatPage.
   */
  const loadSequenceRef = useRef(0);

  // Fetch the first page of conversations (resets pagination state)
  const fetchConversations = useCallback(async () => {
    setIsFetchingConversations(true);
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
      setIsFetchingConversations(false);
    }
  }, [getAuthHeaders, isLoaded, isSignedIn, setConversations, setError]);

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
      setIsCreatingConversation(true);
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
        setIsCreatingConversation(false);
      }
    },
    [getAuthHeaders, addConversation, setActiveConversation, setMessages, setError],
  );

  /**
   * Load a conversation with its messages.
   *
   * Returns `false` ONLY when this request genuinely failed and the caller
   * should surface it (WebChatPage redirects to /chat on `false`). A request
   * superseded by a newer `loadConversation` resolves `true`: it is not a
   * failure, and the newer request owns the outcome -- returning `false` would
   * bounce the user off the conversation they just opened.
   */
  const loadConversation = useCallback(
    async (id: string): Promise<boolean> => {
      // AUDIT-FIX STR-13: claim this request. Every apply point below re-checks
      // the token, so a slower A/B response can never land after C.
      const requestId = (loadSequenceRef.current += 1);
      const cancelled = () => requestId !== loadSequenceRef.current;

      // AUDIT-FIX STR-7/BUG-12: opening a conversation is NOT a turn -- keep it
      // out of the chat store's turn-scoped isLoading (see isFetchingConversations).
      setIsOpeningConversation(true);
      setError(null);

      try {
        const headers = await getAuthHeaders();
        const response = await fetch(managedCloudConversationPath(id), { headers });
        if (cancelled()) return true;

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || 'Failed to load conversation');
        }

        const data = ManagedCloudConversationResponseSchema.parse(await response.json());
        if (cancelled()) return true;
        const loadedConversation = toWebConversation(data.conversation);
        updateConversationInStore(id, {
          title: loadedConversation.title,
          model: loadedConversation.model,
          projectId: loadedConversation.projectId,
          isPinned: loadedConversation.isPinned,
          updatedAt: loadedConversation.updatedAt,
        });

        // Convert API messages to store format
        const messages: Message[] = data.messages.map((m) => {
          // PER-33: validated, not asserted.
          const metadata = readLoadedMessageMetadata(m.metadata);
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.created_at,
            model: m.model ?? undefined,
            attachments: readPersistedAttachments(metadata?.attachments),
            metadata,
          };
        });

        // AUDIT-FIX STR-4/BUG-14: never replace a transcript that is live or
        // already in memory. This used to overwrite unconditionally, so a
        // refetch that raced an in-flight turn (the server copy has the user
        // message but not the still-streaming assistant one) destroyed the
        // assistant message mid-stream. Both guards mirror
        // packages/ui/unified-chat/src/components/ChatInterface.tsx: skip while
        // that conversation is streaming, and short-circuit on a cached
        // transcript. Conversation metadata above is still refreshed either way.
        const state = useChatStore.getState();
        const isStreamingHere = state.streamingConversationIds.includes(id);
        const cachedMessages = state.messagesByConversation[id] ?? [];
        if (isStreamingHere || cachedMessages.length > 0) {
          setActiveConversation(id);
          return true;
        }

        // Atomically set active conversation and messages to avoid race conditions
        setActiveConversationWithMessages(id, messages);
        return true;
      } catch (err) {
        // A superseded request's failure belongs to nobody: surfacing it would
        // put a stale error banner on the conversation the user actually opened.
        if (cancelled()) return true;
        setError(err instanceof Error ? err.message : 'Failed to load conversation', id);
        return false;
      } finally {
        if (!cancelled()) setIsOpeningConversation(false);
      }
    },
    [
      getAuthHeaders,
      updateConversationInStore,
      setActiveConversation,
      setActiveConversationWithMessages,
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
        /** AUDIT-FIX CMP-3: temporary-chat privacy flag (persisted server-side). */
        isTemporary?: boolean;
      },
    ): Promise<boolean> => {
      try {
        const previousProjectId =
          useChatStore.getState().conversations.find((conversation) => conversation.id === id)
            ?.projectId ?? null;
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
          // AUDIT-FIX CMP-3: mirror the SERVER's value, not the optimistic one,
          // so a rejected write can never leave the UI claiming a privacy mode
          // the database does not have.
          isTemporary: data.conversation.is_temporary ?? false,
          updatedAt: data.conversation.updated_at,
        });
        if (Object.prototype.hasOwnProperty.call(updates, 'projectId')) {
          useChatProjectStore
            .getState()
            .reassignConversation(id, previousProjectId, data.conversation.project_id ?? null);
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update conversation', id);
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
        setError(err instanceof Error ? err.message : 'Failed to delete conversation', id);
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
    // AUDIT-FIX STR-7/BUG-12: conversation-CRUD progress only (see the
    // UseConversationsReturn doc) -- never the chat store's turn flag.
    isLoading: isFetchingConversations || isCreatingConversation || isOpeningConversation,
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
