'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/user-error-message';
import { useAuth } from '@clerk/nextjs';
import { useChatProjectStore } from '@agiworkforce/unified-chat';
import { useChatStore, type Conversation, type Message } from '@shared/stores/web-chat-store';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { readPersistedAttachments } from '@/features/chat/lib/persisted-attachments';
import {
  MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE,
  MANAGED_CLOUD_CHAT_MAX_MESSAGE_PAGE_SIZE,
  MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE,
  ManagedCloudConversationListResponseSchema,
  ManagedCloudConversationResponseSchema,
  ManagedCloudCreateConversationResponseSchema,
  ManagedCloudDeleteConversationResponseSchema,
  ManagedCloudMessageMetadataSchema,
  readPersistedInteractiveCards,
  ManagedCloudUpdateConversationRequestSchema,
  ManagedCloudUpdateConversationResponseSchema,
  managedCloudConversationPath,
  normalizeManagedCloudConversation,
  type ManagedCloudConversationWire,
  type ManagedCloudMessageWire,
} from '@agiworkforce/cloud-contracts';

export function readLoadedMessageMetadata(value: unknown): Message['metadata'] {
  if (value === null || value === undefined) return undefined;
  const parsed = ManagedCloudMessageMetadataSchema.safeParse(value);
  if (!parsed.success) {
    console.warn('[useConversations] dropped malformed message metadata', parsed.error.issues);
    return undefined;
  }
  const interactiveCards = readPersistedInteractiveCards(parsed.data);
  return {
    ...parsed.data,
    ...(Object.hasOwn(parsed.data, 'interactiveCards') ? { interactiveCards } : {}),
  } as Message['metadata'];
}

const CONVERSATIONS_PAGE_SIZE = MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE;
const PROJECT_CONVERSATIONS_PAGE_SIZE = MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE;

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
    isTemporary: conversation.isTemporary,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

interface UseConversationsReturn {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  error: string | null;
  /**
   * Failure of the conversation-LIST fetch specifically.
   *
   * `error` above is the store's single global chat error, which any stream or
   * reaction failure also writes to. The sidebar renders its own load-failure
   * copy from whatever it is handed, so passing the global error made an
   * unrelated failure read as "Couldn't load conversations · Failed to update
   * reaction" to a new user with an empty list.
   */
  listError: string | null;
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
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
      isTemporary?: boolean;
    },
  ) => Promise<boolean>;
  deleteConversation: (id: string) => Promise<boolean>;
  setActiveConversation: (id: string | null) => void;
}

export function useConversations(): UseConversationsReturn {
  const { getAuthHeaders, isLoaded, isSignedIn } = useConversationAuthHeaders();
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const error = useChatStore((state) => state.error);

  const setConversations = useChatStore((state) => state.setConversations);
  const addConversation = useChatStore((state) => state.addConversation);
  const upsertConversation = useChatStore((state) => state.upsertConversation);
  const updateConversationInStore = useChatStore((state) => state.updateConversation);
  const deleteConversationFromStore = useChatStore((state) => state.deleteConversation);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const setActiveConversationWithMessages = useChatStore(
    (state) => state.setActiveConversationWithMessages,
  );
  const setMessages = useChatStore((state) => state.setMessages);
  const setError = useChatStore((state) => state.setError);

  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] = useState(false);
  const nextOffsetRef = useRef(0);

  const [isFetchingConversations, setIsFetchingConversations] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [isOpeningConversation, setIsOpeningConversation] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const loadSequenceRef = useRef(0);

  const fetchConversations = useCallback(async () => {
    setIsFetchingConversations(true);
    setError(null);
    setListError(null);

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
      const message = toUserMessage(err, 'Failed to fetch conversations');
      setError(message);
      setListError(message);
    } finally {
      setIsFetchingConversations(false);
    }
  }, [getAuthHeaders, isLoaded, isSignedIn, setConversations, setError]);

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
      setError(toUserMessage(err, 'Failed to load more conversations'));
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
            // Sent AT CREATION, not applied afterwards. Marking a conversation
            // temporary in a follow-up write races the first message's save,
            // and a "never save my chats" preference that saves the first
            // message is worse than no preference at all.
            ...(useSettingsStore.getState().newChatsTemporary ? { isTemporary: true } : {}),
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
        setError(toUserMessage(err, 'Failed to create conversation'));
        return null;
      } finally {
        setIsCreatingConversation(false);
      }
    },
    [getAuthHeaders, addConversation, setActiveConversation, setMessages, setError],
  );

  const loadConversation = useCallback(
    async (id: string): Promise<boolean> => {
      const requestId = (loadSequenceRef.current += 1);
      const cancelled = () => requestId !== loadSequenceRef.current;

      setIsOpeningConversation(true);
      setError(null);

      try {
        const headers = await getAuthHeaders();
        let offset = 0;
        let loadedConversationWire: ManagedCloudConversationWire | undefined;
        const loadedMessageWires: ManagedCloudMessageWire[] = [];
        const loadedMessageIds = new Set<string>();

        for (;;) {
          const response = await fetch(
            `${managedCloudConversationPath(id)}?limit=${MANAGED_CLOUD_CHAT_MAX_MESSAGE_PAGE_SIZE}&offset=${offset}`,
            { headers },
          );
          if (cancelled()) return true;

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || 'Failed to load conversation');
          }

          const page = ManagedCloudConversationResponseSchema.parse(await response.json());
          if (cancelled()) return true;
          if (page.conversation.id !== id) {
            throw new Error('Conversation response did not match the requested chat');
          }
          loadedConversationWire ??= page.conversation;
          for (const message of page.messages) {
            if (loadedMessageIds.has(message.id)) {
              throw new Error('Conversation pagination repeated a message');
            }
            loadedMessageIds.add(message.id);
          }
          loadedMessageWires.push(...page.messages);
          if (!page.hasMore) break;
          if (page.messages.length === 0) {
            throw new Error('Conversation pagination did not advance');
          }
          const nextOffset = offset + page.messages.length;
          if (nextOffset >= page.total) {
            throw new Error('Conversation pagination exceeded its reported total');
          }
          offset = nextOffset;
        }

        if (!loadedConversationWire) {
          throw new Error('Conversation response was empty');
        }
        const loadedConversation = toWebConversation(loadedConversationWire);
        upsertConversation(loadedConversation);

        const messages: Message[] = loadedMessageWires.map((m) => {
          const metadata = readLoadedMessageMetadata(m.metadata);
          const resumesVideo =
            metadata?.toolType === 'video-generation' &&
            (metadata.videoStatus === 'queued' || metadata.videoStatus === 'processing') &&
            typeof metadata.videoTaskId === 'string';
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.created_at,
            parentId: m.parent_id ?? null,
            model: m.model ?? undefined,
            provider: m.provider ?? undefined,
            isStreaming: resumesVideo,
            attachments: readPersistedAttachments(metadata?.attachments),
            metadata,
          };
        });

        const state = useChatStore.getState();
        const isStreamingHere = state.streamingConversationIds.includes(id);
        const cachedMessages = state.messagesByConversation[id] ?? [];
        // A cached transcript keeps its own leaf: the local one reflects a
        // variant the reader picked since this response was issued, and the
        // server's is only authoritative for a transcript loaded fresh.
        if (isStreamingHere || cachedMessages.length > 0) {
          setActiveConversation(id);
          return true;
        }

        setActiveConversationWithMessages(
          id,
          messages,
          loadedConversationWire.active_leaf_message_id ?? null,
        );
        return true;
      } catch (err) {
        if (cancelled()) return true;
        setError(toUserMessage(err, 'Failed to load conversation'), id);
        return false;
      } finally {
        if (!cancelled()) setIsOpeningConversation(false);
      }
    },
    [
      getAuthHeaders,
      upsertConversation,
      setActiveConversation,
      setActiveConversationWithMessages,
      setError,
    ],
  );

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
        setError(toUserMessage(err, 'Failed to update conversation'), id);
        return false;
      }
    },
    [getAuthHeaders, updateConversationInStore, setError],
  );

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
        setError(toUserMessage(err, 'Failed to delete conversation'), id);
        return false;
      }
    },
    [getAuthHeaders, deleteConversationFromStore, setError],
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetchConversations();
  }, [fetchConversations, isLoaded, isSignedIn]);

  // Without this the mount effect is the ONLY caller, so a list fetch that
  // failed once stayed failed until a full page reload — the sidebar renders
  // the message with no control to retry. Coming back to the tab or regaining
  // the network is exactly when the fetch is worth repeating, and it costs one
  // request only when the last attempt actually failed.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !listError) return;
    const retry = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void fetchConversations();
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [fetchConversations, isLoaded, isSignedIn, listError]);

  return {
    conversations,
    activeConversationId,
    isLoading: isFetchingConversations || isCreatingConversation || isOpeningConversation,
    error,
    listError,
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
        setError(toUserMessage(caught, 'Failed to fetch project chats'));
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

  const filteredGroups: Record<string, Conversation[]> = {};
  for (const [key, value] of Object.entries(groups)) {
    if (value.length > 0) {
      filteredGroups[key] = value;
    }
  }

  return filteredGroups;
}
