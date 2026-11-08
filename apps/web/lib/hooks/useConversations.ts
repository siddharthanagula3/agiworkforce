'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/user-error-message';
import {
  createRequestAuthority,
  type RequestAuthority,
  type SessionAuthority,
} from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { useSession } from '@/lib/identity/client';
import { useChatProjectStore } from '@agiworkforce/unified-chat';
import { useChatStore, type Conversation, type Message } from '@shared/stores/web-chat-store';
import { useModelStore } from '@shared/stores/model-store';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { resolveNewChatTemporary } from '@/lib/temporary-chat-policy';
import { readPersistedAttachments } from '@/features/chat/lib/persisted-attachments';
import { readPersistedRouteLane } from '@/features/chat/lib/routeLane';
import { CONVERSATION_NOT_FOUND_MESSAGE } from '@/lib/conversation-load-error';
import { hasPendingDraftClear } from '@/features/chat/lib/pending-draft-clear';
import { observeConversationDraftRevision } from '@/features/chat/services/conversation-draft';
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
const CONVERSATIONS_LIST_RATE_LIMIT_STATUS = 429;
const CONVERSATIONS_LIST_RETRY_BASE_DELAY_MS = 1_000;
const CONVERSATIONS_LIST_RETRY_MAX_DELAY_MS = 30_000;
const CONVERSATIONS_LIST_RETRY_MAX_ATTEMPTS = 5;
const CONVERSATION_NOT_FOUND_STATUSES = new Set([404, 403]);
const CONVERSATION_LOAD_RETRY_MESSAGE =
  "Couldn't load this conversation. Check your connection and try again.";

function conversationLoadErrorMessage(err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' && CONVERSATION_NOT_FOUND_STATUSES.has(status)
    ? CONVERSATION_NOT_FOUND_MESSAGE
    : CONVERSATION_LOAD_RETRY_MESSAGE;
}

function extendedCachedTranscript(
  cached: readonly Message[],
  loaded: readonly Message[],
): Message[] | null {
  if (loaded.length <= cached.length) return null;
  const loadedIds = new Set(loaded.map((message) => message.id));
  if (!cached.every((message) => loadedIds.has(message.id))) return null;
  const cachedById = new Map(cached.map((message) => [message.id, message]));
  return loaded.map((message) => cachedById.get(message.id) ?? message);
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null;
}

function httpResponseError(response: Response, body: unknown): Error {
  const error = (body as { error?: { message?: unknown } | string } | null)?.error;
  const rawMessage = typeof error === 'string' ? error : error?.message;
  const message =
    response.status >= 500 ? '' : typeof rawMessage === 'string' ? rawMessage.trim() : '';
  return Object.assign(new Error(message), { status: response.status });
}

/**
 * How long a list the browser already holds counts as current.
 *
 * AGI-30: one send produced about ten requests under `/api/chat/conversations`.
 * The mount effect is the only list caller, but it is not the only MOUNT: the
 * first send routes `/chat` to `/chat/<id>`, which is a different route segment,
 * so the whole chat page unmounts and mounts again mid-turn and asked for the
 * same list a second time. Shell routes mount a second copy of this hook
 * alongside the page's, and those two race in the same tick.
 *
 * Seconds, not minutes: this only has to span a route change inside one turn.
 * Anything that wants the server's answer regardless calls `fetchConversations`,
 * which always goes out.
 */
const CONVERSATIONS_LIST_FRESH_MS = 30_000;

interface ConversationListFetchOutcome {
  error: string | null;
  hasMore: boolean;
  nextOffset: number;
}

interface ConversationListRequest {
  authority: RequestAuthority;
  promise: Promise<ConversationListFetchOutcome | null>;
  subscribeBusy: (listener: (busy: boolean) => void) => () => void;
}

interface ConversationListLoad {
  session: SessionAuthority;
  loadedAtMs: number;
  hasMore: boolean;
  nextOffset: number;
  retryAttempt: number;
  inFlight: ConversationListRequest | null;
}

// The shared request survives a route-hook unmount, but never its captured session.
let conversationListLoad: ConversationListLoad | null = null;

export function __resetConversationListLoadForTests(): void {
  conversationListLoad?.inFlight?.authority.retire();
  conversationListLoad = null;
}

function getConversationListLoad(session: SessionAuthority): ConversationListLoad {
  const existing = conversationListLoad;
  if (
    existing &&
    existing.session.userId === session.userId &&
    existing.session.sessionId === session.sessionId &&
    existing.session.isCurrent() &&
    session.isCurrent()
  )
    return existing;

  existing?.inFlight?.authority.retire();
  const next: ConversationListLoad = {
    session,
    loadedAtMs: 0,
    hasMore: false,
    nextOffset: 0,
    retryAttempt: 0,
    inFlight: null,
  };
  conversationListLoad = next;
  return next;
}

function waitForListRetry(authority: RequestAuthority, delay: number): Promise<void> {
  authority.assertCurrent();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timeout);
      reject(new DOMException('Request owner changed', 'AbortError'));
    };
    const timeout = setTimeout(() => {
      authority.signal.removeEventListener('abort', abort);
      resolve();
    }, delay);
    authority.signal.addEventListener('abort', abort, { once: true });
  });
}

function startConversationListFetch(cache: ConversationListLoad): ConversationListRequest {
  if (cache.inFlight?.authority.isCurrent()) return cache.inFlight;
  const authority = createRequestAuthority(cache.session, () => conversationListLoad === cache);
  let busy = true;
  const busyListeners = new Set<(busy: boolean) => void>();
  const setBusy = (next: boolean) => {
    busy = next;
    for (const listener of busyListeners) listener(busy);
  };
  const promise = (async (): Promise<ConversationListFetchOutcome | null> => {
    try {
      for (;;) {
        const response = await authority.fetch(
          `/api/chat/conversations?limit=${CONVERSATIONS_PAGE_SIZE}&offset=0`,
          { headers: { 'Content-Type': 'application/json' } },
        );
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          authority.assertCurrent();
          if (
            response.status === CONVERSATIONS_LIST_RATE_LIMIT_STATUS &&
            cache.retryAttempt < CONVERSATIONS_LIST_RETRY_MAX_ATTEMPTS
          ) {
            const attempt = cache.retryAttempt++;
            const delay =
              parseRetryAfterMs(response.headers.get('retry-after')) ??
              Math.min(
                CONVERSATIONS_LIST_RETRY_BASE_DELAY_MS * 2 ** attempt,
                CONVERSATIONS_LIST_RETRY_MAX_DELAY_MS,
              );
            setBusy(false);
            await waitForListRetry(authority, delay);
            authority.assertCurrent();
            setBusy(true);
            continue;
          }
          throw httpResponseError(response, body);
        }
        const body: unknown = await response.json();
        authority.assertCurrent();
        const data = ManagedCloudConversationListResponseSchema.parse(body);
        useChatStore.getState().setConversations(data.conversations.map(toWebConversation));
        cache.retryAttempt = 0;
        cache.loadedAtMs = Date.now();
        cache.hasMore = data.hasMore;
        cache.nextOffset = data.nextOffset;
        return { error: null, hasMore: data.hasMore, nextOffset: data.nextOffset };
      }
    } catch (err) {
      if (!authority.isCurrent()) return null;
      return {
        error: toUserMessage(err, 'Failed to fetch conversations'),
        hasMore: cache.hasMore,
        nextOffset: cache.nextOffset,
      };
    }
  })();
  const request: ConversationListRequest = {
    authority,
    promise,
    subscribeBusy: (listener) => {
      busyListeners.add(listener);
      listener(busy);
      return () => {
        busyListeners.delete(listener);
      };
    },
  };
  cache.inFlight = request;
  void promise.finally(() => {
    if (cache.inFlight === request) cache.inFlight = null;
    busyListeners.clear();
  });
  return request;
}

function useConversationReadScope() {
  const captureSession = useSessionSnapshot();
  const sessionRef = useRef<SessionAuthority | null>(null);
  if (!sessionRef.current?.isCurrent()) sessionRef.current = captureSession();
  const session = sessionRef.current;
  const lifetimeRef = useRef({});
  const mountedRef = useRef(true);
  const requestsRef = useRef(new Set<RequestAuthority>());
  useEffect(() => {
    const requests = requestsRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lifetimeRef.current = {};
      for (const request of requests) request.retire();
      requests.clear();
      if (conversationListLoad && !conversationListLoad.session.isCurrent()) {
        conversationListLoad.inFlight?.authority.retire();
      }
    };
  }, [session]);
  const canRead = useCallback(() => mountedRef.current && session?.isCurrent() === true, [session]);
  const createReadAuthority = useCallback(
    (isOwner: () => boolean = () => true) => {
      if (!session || !canRead()) return null;
      const lifetime = lifetimeRef.current;
      const authority = createRequestAuthority(
        session,
        () => lifetimeRef.current === lifetime && isOwner(),
      );
      requestsRef.current.add(authority);
      authority.signal.addEventListener(
        'abort',
        () => {
          requestsRef.current.delete(authority);
        },
        { once: true },
      );
      return authority;
    },
    [canRead, session],
  );
  const releaseReadAuthority = useCallback((authority: RequestAuthority) => {
    requestsRef.current.delete(authority);
    authority.retire();
  }, []);
  return { session, canRead, createReadAuthority, releaseReadAuthority };
}

// getToken is not reference-stable across renders while Clerk settles; a ref
// keeps getAuthHeaders (and everything derived from it) stable instead.
function useConversationAuthHeaders() {
  const { getToken, isLoaded, isSignedIn, userId } = useSession();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const getAuthHeaders = useCallback(async () => {
    if (!isLoaded) {
      throw new Error('Authentication is still loading');
    }
    if (!isSignedIn) {
      throw new Error('Not authenticated');
    }
    const token = await getTokenRef.current();
    if (!token) {
      throw new Error('Not authenticated');
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }, [isLoaded, isSignedIn]);

  return { getAuthHeaders, isLoaded, isSignedIn, userId };
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
    selectedRouteId: conversation.selectedRouteId ?? null,
    projectId: conversation.projectId,
    isPinned: conversation.pinned,
    isStarred: conversation.starred,
    isArchived: conversation.archived,
    isTemporary: conversation.isTemporary,
    ...(conversation.workMode ? { workMode: conversation.workMode } : {}),
    ...(conversation.needsYou ? { needsYou: true } : {}),
    ...(wire.instructions ? { instructions: wire.instructions } : {}),
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
  getConversationLoadError: () => string | null;
  hasMoreConversations: boolean;
  isLoadingMoreConversations: boolean;
  fetchConversations: () => Promise<void>;
  loadMoreConversations: () => Promise<void>;
  createConversation: (
    title?: string,
    model?: string,
    projectId?: string | null,
    options?: {
      isTemporary?: boolean;
      selectedRouteId?: string | null;
      authority?: RequestAuthority;
      shouldActivate?: () => boolean;
    },
  ) => Promise<Conversation | null>;
  loadConversation: (id: string) => Promise<boolean>;
  /**
   * Re-reads the open conversation without a loading state or an error, so a
   * turn added on another surface appears here; a turn in flight here wins.
   */
  refreshOpenConversation: (id: string) => Promise<boolean>;
  updateConversation: (
    id: string,
    updates: {
      title?: string;
      model?: string;
      selectedRouteId?: string | null;
      projectId?: string | null;
      pinned?: boolean;
      starred?: boolean;
      archived?: boolean;
      isTemporary?: boolean;
      instructions?: string | null;
    },
  ) => Promise<boolean>;
  deleteConversation: (id: string) => Promise<boolean>;
  setActiveConversation: (id: string | null) => void;
}

export function useConversations(): UseConversationsReturn {
  const { getAuthHeaders, isLoaded, isSignedIn } = useConversationAuthHeaders();
  const { session, canRead, createReadAuthority, releaseReadAuthority } =
    useConversationReadScope();
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
  const creatingConversationOwnersRef = useRef(new Set<object>());
  const [isOpeningConversation, setIsOpeningConversation] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const conversationLoadErrorRef = useRef<string | null>(null);
  const getConversationLoadError = useCallback(() => conversationLoadErrorRef.current, []);
  const foregroundLoadOwnerRef = useRef<object | null>(null);
  const listApplyOwnerRef = useRef<RequestAuthority | null>(null);
  const loadMoreOwnerRef = useRef<RequestAuthority | null>(null);
  const openingOwnerRef = useRef<RequestAuthority | null>(null);
  const refreshOwnerRef = useRef<RequestAuthority | null>(null);

  useEffect(() => {
    setIsFetchingConversations(false);
    setIsOpeningConversation(false);
    setIsLoadingMoreConversations(false);
    setHasMoreConversations(false);
    setListError(null);
    nextOffsetRef.current = 0;
    conversationLoadErrorRef.current = null;
    return () => {
      listApplyOwnerRef.current = null;
      loadMoreOwnerRef.current = null;
      openingOwnerRef.current = null;
      refreshOwnerRef.current = null;
      foregroundLoadOwnerRef.current = null;
    };
  }, [session]);

  const applyListFetch = useCallback(
    async (request: ConversationListRequest) => {
      listApplyOwnerRef.current?.retire();
      const authority: RequestAuthority | null = createReadAuthority(
        () => listApplyOwnerRef.current === authority,
      );
      if (!authority) return;
      listApplyOwnerRef.current = authority;
      setIsFetchingConversations(true);
      setListError(null);
      const unsubscribe = request.subscribeBusy((busy) => {
        if (authority.isCurrent() && request.authority.isCurrent())
          setIsFetchingConversations(busy);
      });
      if (authority.signal.aborted) unsubscribe();
      else authority.signal.addEventListener('abort', unsubscribe, { once: true });
      try {
        const outcome = await request.promise;
        if (!outcome || !authority.isCurrent() || !request.authority.isCurrent()) return;
        setListError(outcome.error);
        setHasMoreConversations(outcome.hasMore);
        nextOffsetRef.current = outcome.nextOffset;
      } finally {
        unsubscribe();
        authority.signal.removeEventListener('abort', unsubscribe);
        if (listApplyOwnerRef.current === authority) {
          listApplyOwnerRef.current = null;
          setIsFetchingConversations(false);
        }
        releaseReadAuthority(authority);
      }
    },
    [createReadAuthority, releaseReadAuthority],
  );

  const fetchConversations = useCallback(async () => {
    if (!session || !canRead()) return;
    const cache = getConversationListLoad(session);
    cache.loadedAtMs = 0;
    await applyListFetch(startConversationListFetch(cache));
  }, [applyListFetch, canRead, session]);

  const loadConversationsIfStale = useCallback(async () => {
    if (!session || !canRead()) return;
    const cache = getConversationListLoad(session);
    const fresh =
      cache.inFlight === null &&
      Date.now() - cache.loadedAtMs < CONVERSATIONS_LIST_FRESH_MS &&
      useChatStore.getState().conversations.length > 0;
    if (fresh) {
      setHasMoreConversations(cache.hasMore);
      nextOffsetRef.current = cache.nextOffset;
      return;
    }
    await applyListFetch(startConversationListFetch(cache));
  }, [applyListFetch, canRead, session]);

  const loadMoreConversations = useCallback(async () => {
    if (!session?.isCurrent() || loadMoreOwnerRef.current || !hasMoreConversations) {
      return;
    }
    const authority: RequestAuthority | null = createReadAuthority(
      () => loadMoreOwnerRef.current === authority,
    );
    if (!authority) return;
    loadMoreOwnerRef.current = authority;

    setIsLoadingMoreConversations(true);
    setError(null);

    try {
      // W07: the next page starts after the rows still held, not after the
      // count the server echoed when the last page arrived. Deleting or
      // archiving a loaded conversation shifts every later row down by one, so
      // resuming at the stale echo stepped over exactly as many rows as had
      // been removed and they could never be reached again. Clamped rather than
      // replaced so a locally created conversation cannot push the offset past
      // what the server has served; the id dedupe below absorbs any overlap.
      const offset = Math.min(nextOffsetRef.current, conversations.length);
      const response = await authority.fetch(
        `/api/chat/conversations?limit=${CONVERSATIONS_PAGE_SIZE}&offset=${offset}`,
        { headers: { 'Content-Type': 'application/json' } },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        authority.assertCurrent();
        throw httpResponseError(response, errorData);
      }

      const body: unknown = await response.json();
      authority.assertCurrent();
      const data = ManagedCloudConversationListResponseSchema.parse(body);
      const newConversations = data.conversations.map(toWebConversation);

      const existingIds = new Set(conversations.map((c) => c.id));
      const deduped = newConversations.filter((c) => !existingIds.has(c.id));
      setConversations([...conversations, ...deduped]);

      nextOffsetRef.current = data.nextOffset;
      setHasMoreConversations(data.hasMore);
    } catch (err) {
      if (!authority.isCurrent()) return;
      setError(toUserMessage(err, 'Failed to load more conversations'));
    } finally {
      if (loadMoreOwnerRef.current === authority) {
        loadMoreOwnerRef.current = null;
        setIsLoadingMoreConversations(false);
      }
      releaseReadAuthority(authority);
    }
  }, [
    session,
    createReadAuthority,
    releaseReadAuthority,
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
      options?: {
        isTemporary?: boolean;
        selectedRouteId?: string | null;
        authority?: RequestAuthority;
        shouldActivate?: () => boolean;
      },
    ): Promise<Conversation | null> => {
      const authority = options?.authority;
      authority?.assertCurrent();
      const creationOwner = {};
      creatingConversationOwnersRef.current.add(creationOwner);
      setIsCreatingConversation(true);
      setError(null);

      try {
        const headers = await addCsrfHeaders(
          authority
            ? {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${await authority.getToken()}`,
              }
            : await getAuthHeaders(),
        );
        authority?.assertCurrent();
        const selectedModelState = useModelStore.getState();
        const selectedRouteId =
          options?.selectedRouteId === undefined && model === selectedModelState.selectedModelId
            ? selectedModelState.selectedRouteId
            : options?.selectedRouteId;
        const response = await (authority?.fetch ?? fetch)('/api/chat/conversations', {
          ...(authority ? { credentials: 'omit' as const } : {}),
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: title || 'New conversation',
            model,
            ...(selectedRouteId ? { selectedRouteId } : {}),
            ...(projectId ? { projectId } : {}),
            // Sent AT CREATION, not applied afterwards. Marking a conversation
            // temporary in a follow-up write races the first message's save,
            // and a "never save my chats" preference that saves the first
            // message is worse than no preference at all. The account-wide
            // default and a one-off "Temporary chat" armed from the composer
            // before this conversation existed are both consumed here.
            ...((options?.isTemporary ??
            resolveNewChatTemporary(
              useChatStore.getState().pendingTemporaryChat,
              useSettingsStore.getState().newChatsTemporary,
              projectId,
            ))
              ? { isTemporary: true }
              : {}),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          authority?.assertCurrent();
          if (response.status === 429) {
            const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
            const seconds =
              retryAfterMs === null ? null : Math.max(1, Math.ceil(retryAfterMs / 1000));
            const retryMessage =
              seconds === null
                ? 'This account is sending requests too quickly. Wait a moment and try again.'
                : `This account is sending requests too quickly. Try again in about ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
            throw Object.assign(new Error(retryMessage), { status: response.status });
          }
          throw httpResponseError(response, errorData);
        }

        const data = ManagedCloudCreateConversationResponseSchema.parse(await response.json());
        authority?.assertCurrent();
        const conversation = toWebConversation(data.conversation);

        addConversation(conversation);
        if (options?.shouldActivate?.() !== false) {
          setActiveConversation(conversation.id);
          setMessages([]);
        }

        return conversation;
      } catch (err) {
        if (authority && !authority.isCurrent()) throw err;
        if (options?.shouldActivate?.() !== false) {
          setError(toUserMessage(err, 'Failed to create conversation'));
        }
        return null;
      } finally {
        creatingConversationOwnersRef.current.delete(creationOwner);
        setIsCreatingConversation(creatingConversationOwnersRef.current.size > 0);
      }
    },
    [getAuthHeaders, addConversation, setActiveConversation, setMessages, setError],
  );

  const readConversation = useCallback(
    async (id: string, quiet: boolean): Promise<boolean> => {
      if (!session?.isCurrent()) return true;
      if (quiet) {
        refreshOwnerRef.current?.retire();
      } else {
        openingOwnerRef.current?.retire();
        refreshOwnerRef.current?.retire();
        foregroundLoadOwnerRef.current = {};
      }
      const foregroundOwner = foregroundLoadOwnerRef.current;
      const authority: RequestAuthority | null = createReadAuthority(
        () =>
          foregroundLoadOwnerRef.current === foregroundOwner &&
          (quiet
            ? refreshOwnerRef.current === authority &&
              useChatStore.getState().activeConversationId === id
            : openingOwnerRef.current === authority),
      );
      if (!authority) return true;
      if (quiet) refreshOwnerRef.current = authority;
      else openingOwnerRef.current = authority;
      const cancelled = () => !authority.isCurrent();

      if (!quiet) {
        setIsOpeningConversation(true);
        setError(null);
        conversationLoadErrorRef.current = null;
      }

      try {
        let offset = 0;
        let loadedConversationWire: ManagedCloudConversationWire | undefined;
        const loadedMessageWires: ManagedCloudMessageWire[] = [];
        const loadedMessageIds = new Set<string>();

        for (;;) {
          const response = await authority.fetch(
            `${managedCloudConversationPath(id)}?limit=${MANAGED_CLOUD_CHAT_MAX_MESSAGE_PAGE_SIZE}&offset=${offset}`,
            { headers: { 'Content-Type': 'application/json' } },
          );
          if (cancelled()) return true;

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            authority.assertCurrent();
            throw httpResponseError(response, errorData);
          }

          const body: unknown = await response.json();
          if (cancelled()) return true;
          const page = ManagedCloudConversationResponseSchema.parse(body);
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
        observeConversationDraftRevision(
          id,
          loadedConversationWire.draft_updated_at,
          authority.session,
        );

        // A draft this device has not seen belongs in the composer: it was
        // typed on another machine, or before a reload here. A draft already
        // parked locally wins, because it is what the person in front of this
        // composer typed most recently.
        const serverDraft = loadedConversationWire.draft?.trim() ?? '';
        if (hasPendingDraftClear(id) && !useChatStore.getState().getDraftContent(id)) {
          useChatStore.getState().clearDraftContent(id);
        } else if (serverDraft && !useChatStore.getState().getDraftContent(id)) {
          useChatStore.getState().setDraftContent(serverDraft, id);
        }

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
            routeLane: readPersistedRouteLane(metadata),
            isStreaming: resumesVideo,
            attachments: readPersistedAttachments(metadata?.attachments),
            metadata,
          };
        });

        const state = useChatStore.getState();
        const cachedMessages = state.messagesByConversation[id] ?? [];
        // A cached transcript keeps its own rows and leaf: the local leaf
        // reflects a variant the reader picked since this response was issued,
        // and a live turn here is newer than any snapshot. Only when the server
        // holds every cached row plus newer ones (a turn finished on another
        // device or after this tab cached it) does the transcript take them and
        // the server's leaf, which is the one pointing at those rows. A
        // conversation still marked streaming with nothing cached (a durable
        // run whose local reader stalled) has nothing to show from the local
        // state, so it still takes the fresh fetch below rather than leaving
        // the route with no transcript to render.
        if (cachedMessages.length > 0) {
          const turnInFlight =
            state.streamingConversationIds.includes(id) ||
            state.loadingConversationIds.includes(id);
          const extended = turnInFlight ? null : extendedCachedTranscript(cachedMessages, messages);
          if (!extended) {
            if (!quiet) setActiveConversation(id);
            return true;
          }
          setActiveConversationWithMessages(
            id,
            extended,
            loadedConversationWire.active_leaf_message_id ?? null,
          );
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
        if (quiet) return false;
        conversationLoadErrorRef.current = conversationLoadErrorMessage(err);
        setError(toUserMessage(err, 'Failed to load conversation'), id);
        return false;
      } finally {
        if (!quiet && openingOwnerRef.current === authority) {
          openingOwnerRef.current = null;
          setIsOpeningConversation(false);
        }
        if (quiet && refreshOwnerRef.current === authority) refreshOwnerRef.current = null;
        releaseReadAuthority(authority);
      }
    },
    [
      session,
      createReadAuthority,
      releaseReadAuthority,
      upsertConversation,
      setActiveConversation,
      setActiveConversationWithMessages,
      setError,
    ],
  );

  const loadConversation = useCallback(
    (id: string): Promise<boolean> => readConversation(id, false),
    [readConversation],
  );

  const refreshOpenConversation = useCallback(
    async (id: string): Promise<boolean> => {
      const state = useChatStore.getState();
      if (
        state.activeConversationId !== id ||
        state.streamingConversationIds.includes(id) ||
        state.loadingConversationIds.includes(id)
      ) {
        return false;
      }
      return readConversation(id, true);
    },
    [readConversation],
  );

  const updateConversation = useCallback(
    async (
      id: string,
      updates: {
        title?: string;
        model?: string;
        selectedRouteId?: string | null;
        projectId?: string | null;
        pinned?: boolean;
        starred?: boolean;
        archived?: boolean;
        isTemporary?: boolean;
        instructions?: string | null;
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
          throw httpResponseError(response, errorData);
        }

        const data = ManagedCloudUpdateConversationResponseSchema.parse(await response.json());
        updateConversationInStore(id, {
          title: data.conversation.title ?? 'Untitled',
          model: data.conversation.model ?? undefined,
          selectedRouteId: data.conversation.selected_route_id ?? null,
          projectId: data.conversation.project_id ?? null,
          isPinned: data.conversation.pinned ?? false,
          isStarred: data.conversation.starred ?? false,
          isArchived: data.conversation.archived ?? false,
          isTemporary: data.conversation.is_temporary ?? false,
          instructions: data.conversation.instructions ?? null,
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
          throw httpResponseError(response, errorData);
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
    void loadConversationsIfStale();
  }, [isLoaded, isSignedIn, loadConversationsIfStale]);

  // Without this the mount effect is the ONLY caller, so a list fetch that
  // failed once stayed failed until a full page reload, the sidebar renders
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
    getConversationLoadError,
    hasMoreConversations,
    isLoadingMoreConversations,
    fetchConversations,
    loadMoreConversations,
    createConversation,
    loadConversation,
    refreshOpenConversation,
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
  const { isLoaded, isSignedIn } = useSession();
  const { session, createReadAuthority, releaseReadAuthority } = useConversationReadScope();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const nextOffsetRef = useRef(0);
  const pageOwnerRef = useRef<RequestAuthority | null>(null);
  const projectScopeRef = useRef({ projectId });
  if (projectScopeRef.current.projectId !== projectId) projectScopeRef.current = { projectId };

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!projectId || !session?.isCurrent()) {
        if (!projectId || (isLoaded && !isSignedIn)) setIsLoading(false);
        return;
      }

      const projectScope = projectScopeRef.current;
      if (projectScope.projectId !== projectId) return;
      pageOwnerRef.current?.retire();
      const authority: RequestAuthority | null = createReadAuthority(
        () => pageOwnerRef.current === authority && projectScopeRef.current === projectScope,
      );
      if (!authority) return;
      pageOwnerRef.current = authority;
      setIsLoadingMore(append);
      setIsLoading(!append);
      setError(null);
      try {
        const response = await authority.fetch(
          `/api/chat/conversations?projectId=${encodeURIComponent(projectId)}&limit=${PROJECT_CONVERSATIONS_PAGE_SIZE}&offset=${offset}`,
          { headers: { 'Content-Type': 'application/json' } },
        );
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          authority.assertCurrent();
          throw httpResponseError(response, errorData);
        }

        const body: unknown = await response.json();
        authority.assertCurrent();
        const data = ManagedCloudConversationListResponseSchema.parse(body);
        const page = data.conversations.map(toWebConversation);
        setConversations((current) => {
          if (!append) return page;
          const existingIds = new Set(current.map((conversation) => conversation.id));
          return [...current, ...page.filter((conversation) => !existingIds.has(conversation.id))];
        });
        nextOffsetRef.current = data.nextOffset;
        setHasMore(data.hasMore);
      } catch (caught) {
        if (!authority.isCurrent()) return;
        setError(toUserMessage(caught, 'Failed to fetch project chats'));
        if (!append) {
          setConversations([]);
          setHasMore(false);
        }
      } finally {
        if (pageOwnerRef.current === authority) {
          pageOwnerRef.current = null;
          setIsLoadingMore(false);
          setIsLoading(false);
        }
        releaseReadAuthority(authority);
      }
    },
    [createReadAuthority, releaseReadAuthority, isLoaded, isSignedIn, projectId, session],
  );

  const retry = useCallback(async () => fetchPage(0, false), [fetchPage]);
  const loadMore = useCallback(async () => fetchPage(nextOffsetRef.current, true), [fetchPage]);

  useEffect(() => {
    setConversations([]);
    setError(null);
    setHasMore(false);
    setIsLoading(Boolean(projectId));
    setIsLoadingMore(false);
    nextOffsetRef.current = 0;
    void retry();
    return () => {
      pageOwnerRef.current?.retire();
      pageOwnerRef.current = null;
    };
  }, [projectId, retry]);

  return { conversations, isLoading, error, hasMore, isLoadingMore, retry, loadMore };
}
