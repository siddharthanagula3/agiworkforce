/**
 * Shared, platform-agnostic chat store.
 *
 * Returns a Zustand **vanilla** store (`createStore`) so each surface can wrap
 * it with its own React bindings (`useStore` / `create`) and persist storage.
 * The store is PURE: no `next/`, no `@tauri-apps`, no `fetch` literal, no DOM
 * or node-only globals. All IO is injected through a {@link ChatStorePort}
 * adapter passed to {@link createChatStore}. Web wires the port against
 * `fetch('/api/llm/v1/chat/completions')`; desktop wires it against Tauri
 * `invoke(...)`; mobile wires its own transport.
 *
 * Data model: a SUPERSET of both existing surfaces.
 *   - `messagesByConversation` map (desktop model) is the source of truth.
 *   - `messages` is the active-conversation mirror (web model) kept in sync.
 *   - streaming/tool/search/code-exec helpers (web model) are first-class.
 *
 * The method names + semantics intentionally match the web store
 * (`addMessage` / `updateMessage` / `appendToMessage` / `appendToThinking` /
 * `setToolTimeline` / `startStreaming` / `stopStreaming` / `setError` …) so the
 * web `useChatStream` can migrate onto this store without changing call sites.
 *
 * @module chat/chatStore
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  ChatMessage,
  ChatConversation,
  ChatToolEntry,
  ChatSearchResult,
  ChatCodeExecutionResult,
  CreateConversationOptions,
  ChatStorePort,
  SendChatParams,
  SendChatCallbacks,
} from './types';

// ---------------------------------------------------------------------------
// State + actions
// ---------------------------------------------------------------------------

export interface ChatStoreState {
  // --- conversation data ---
  conversations: ChatConversation[];
  activeConversationId: string | null;
  /** Source-of-truth per-conversation message lists (desktop model). */
  messagesByConversation: Record<string, ChatMessage[]>;
  /** Active-conversation mirror (web model). Always equals
   *  `messagesByConversation[activeConversationId]`. */
  messages: ChatMessage[];

  // --- ui / lifecycle flags ---
  isStreaming: boolean;
  isLoading: boolean;
  isLoadingMessages: boolean;
  error: string | null;

  // --- model selection ---
  selectedModelId: string;

  // --- pure state actions (no IO) ---
  /** Ensure there is an active conversation; create one if none. Returns its id. */
  ensureActiveConversation: () => string;
  /** Create a local conversation (no remote call). Returns the new id. */
  createConversation: (title?: string, opts?: CreateConversationOptions) => string;
  selectConversation: (id: string) => void;
  setConversations: (conversations: ChatConversation[]) => void;
  setConversationMessages: (id: string, messages: ChatMessage[]) => void;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  togglePinnedConversation: (id: string) => void;
  archiveConversation: (id: string) => void;
  restoreConversation: (id: string) => void;
  setConversationProject: (id: string, projectId: string | null) => void;

  addMessage: (message: ChatMessage) => string;
  /** Optimistic message helpers — message carries its own client id. */
  addOptimisticMessage: (message: ChatMessage) => string;
  confirmOptimisticMessage: (clientId: string, patch?: Partial<ChatMessage>) => void;
  failOptimisticMessage: (clientId: string, error: string) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  appendToMessage: (id: string, chunk: string) => void;
  appendToThinking: (id: string, chunk: string) => void;
  setToolTimeline: (id: string, tools: ChatToolEntry[]) => void;
  updateToolEntry: (id: string, toolCallId: string, patch: Partial<ChatToolEntry>) => void;
  setSearching: (id: string, isSearching: boolean) => void;
  setSearchResults: (id: string, results: ChatSearchResult[]) => void;
  setExecutingCode: (id: string, isExecuting: boolean) => void;
  setCodeExecutionResult: (id: string, result: ChatCodeExecutionResult) => void;
  deleteMessage: (id: string) => void;

  startStreaming: (id: string) => void;
  stopStreaming: () => void;
  setLoading: (loading: boolean) => void;
  setLoadingMessages: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedModel: (modelId: string) => void;
  reset: () => void;

  // --- async actions (delegate to the injected port) ---
  /** Load the conversation list via `port.loadConversations`. */
  loadConversations: () => Promise<void>;
  /** Load messages for a conversation via `port.loadConversationMessages`. */
  loadConversationMessages: (id: string) => Promise<void>;
  /**
   * Send a user turn. Adds the user + optimistic assistant messages, then
   * delegates the transport to `port.sendChat`, forwarding stream events to the
   * matching state actions. Resolves when the stream completes.
   */
  send: (params: SendUserMessageParams) => Promise<void>;
}

/** Params for the high-level `send` action. */
export interface SendUserMessageParams {
  content: string;
  /** Override the conversation to send into; defaults to the active one. */
  conversationId?: string;
  /** Override the model; defaults to `selectedModelId`. */
  model?: string;
  webSearch?: boolean;
  thinkingEnabled?: boolean;
  codeExecution?: boolean;
  effort?: string;
  /** Surface-specific extras forwarded verbatim to the port. */
  extra?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Factory for ids (defaults to a built-in generator). */
  generateId?: () => string;
}

export type ChatStore = StoreApi<ChatStoreState>;

/** Options for {@link createChatStore}. */
export interface CreateChatStoreOptions {
  /** The injected transport boundary. Required: at minimum it must provide `sendChat`. */
  port: ChatStorePort;
  /** Initial model id. The store never invents a default literal of its own. */
  initialModelId?: string;
  /** Id generator (testable seam). Defaults to a time+random string. */
  generateId?: () => string;
}

// ---------------------------------------------------------------------------
// Helpers (pure)
// ---------------------------------------------------------------------------

function defaultGenerateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Immutably map the messages of one conversation, keeping the active mirror in sync. */
function patchConversationMessages(
  state: ChatStoreState,
  conversationId: string | null,
  mapFn: (messages: ChatMessage[]) => ChatMessage[],
): Pick<ChatStoreState, 'messagesByConversation' | 'messages'> {
  if (!conversationId) {
    return {
      messagesByConversation: state.messagesByConversation,
      messages: state.messages,
    };
  }
  const current = state.messagesByConversation[conversationId] ?? [];
  const next = mapFn(current);
  const messagesByConversation = {
    ...state.messagesByConversation,
    [conversationId]: next,
  };
  return {
    messagesByConversation,
    messages: conversationId === state.activeConversationId ? next : state.messages,
  };
}

/** Find which conversation a message id belongs to (active first, then any). */
function findConversationOfMessage(state: ChatStoreState, messageId: string): string | null {
  if (
    state.activeConversationId &&
    (state.messagesByConversation[state.activeConversationId] ?? []).some((m) => m.id === messageId)
  ) {
    return state.activeConversationId;
  }
  for (const [convId, msgs] of Object.entries(state.messagesByConversation)) {
    if (msgs.some((m) => m.id === messageId)) return convId;
  }
  return null;
}

/** Patch a single message by id wherever it lives. */
function patchMessageById(
  state: ChatStoreState,
  messageId: string,
  patch: (message: ChatMessage) => ChatMessage,
): Pick<ChatStoreState, 'messagesByConversation' | 'messages'> {
  const convId = findConversationOfMessage(state, messageId);
  return patchConversationMessages(state, convId, (msgs) =>
    msgs.map((m) => (m.id === messageId ? patch(m) : m)),
  );
}

/** Read surface-metadata bag off a message (kept generic — see ChatMessage.metadata). */
function withMetadata(message: ChatMessage, patch: Record<string, unknown>): ChatMessage {
  return { ...message, metadata: { ...message.metadata, ...patch } };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a platform-agnostic chat store.
 *
 * @example
 * // web
 * const store = createChatStore({ port: webChatPort, initialModelId });
 * const useChat = (sel) => useStore(store, sel); // React binding owned by surface
 */
export function createChatStore(options: CreateChatStoreOptions): ChatStore {
  const { port, initialModelId = '', generateId = defaultGenerateId } = options;

  if (typeof port.sendChat !== 'function') {
    throw new Error('createChatStore: port.sendChat is required');
  }

  const initialState = {
    conversations: [] as ChatConversation[],
    activeConversationId: null as string | null,
    messagesByConversation: {} as Record<string, ChatMessage[]>,
    messages: [] as ChatMessage[],
    isStreaming: false,
    isLoading: false,
    isLoadingMessages: false,
    error: null as string | null,
    selectedModelId: initialModelId,
  };

  return createStore<ChatStoreState>((set, get) => ({
    ...initialState,

    // ---- conversations (pure) ----
    ensureActiveConversation: () => {
      const { activeConversationId } = get();
      if (activeConversationId) return activeConversationId;
      return get().createConversation();
    },

    createConversation: (title, opts) => {
      const id = opts?.id ?? generateId();
      const conversation: ChatConversation = {
        id,
        title: title ?? 'New chat',
        updatedAt: new Date().toISOString(),
        pinned: false,
        archived: false,
        projectId: opts?.projectId ?? null,
        messageCount: 0,
        ...(opts?.modelOverride !== undefined ? { modelOverride: opts.modelOverride } : {}),
        ...(opts?.incognito !== undefined ? { incognito: opts.incognito } : {}),
      };
      const activate = opts?.activate ?? true;
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        messagesByConversation: { ...state.messagesByConversation, [id]: [] },
        ...(activate ? { activeConversationId: id, messages: [], error: null } : {}),
      }));
      return id;
    },

    selectConversation: (id) =>
      set((state) => ({
        activeConversationId: id,
        messages: state.messagesByConversation[id] ?? [],
        error: null,
      })),

    setConversations: (conversations) => set({ conversations }),

    setConversationMessages: (id, messages) =>
      set((state) => ({
        messagesByConversation: { ...state.messagesByConversation, [id]: messages },
        messages: id === state.activeConversationId ? messages : state.messages,
      })),

    renameConversation: (id, title) =>
      set((state) => ({
        conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
      })),

    deleteConversation: (id) =>
      set((state) => {
        const { [id]: _removed, ...restMessages } = state.messagesByConversation;
        void _removed;
        const isActive = state.activeConversationId === id;
        return {
          conversations: state.conversations.filter((c) => c.id !== id),
          messagesByConversation: restMessages,
          activeConversationId: isActive ? null : state.activeConversationId,
          messages: isActive ? [] : state.messages,
        };
      }),

    togglePinnedConversation: (id) =>
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, pinned: !c.pinned } : c,
        ),
      })),

    archiveConversation: (id) =>
      set((state) => ({
        conversations: state.conversations.map((c) => (c.id === id ? { ...c, archived: true } : c)),
      })),

    restoreConversation: (id) =>
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, archived: false } : c,
        ),
      })),

    setConversationProject: (id, projectId) =>
      set((state) => ({
        conversations: state.conversations.map((c) => (c.id === id ? { ...c, projectId } : c)),
      })),

    // ---- messages (pure) ----
    addMessage: (message) => {
      const id = message.id || generateId();
      const msg: ChatMessage = message.id ? message : { ...message, id };
      set((state) => {
        const convId = msg.conversationId ?? state.activeConversationId;
        const patched = patchConversationMessages(state, convId, (msgs) => [...msgs, msg]);
        return {
          ...patched,
          conversations: state.conversations.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messageCount: (c.messageCount ?? 0) + 1,
                  updatedAt: new Date().toISOString(),
                }
              : c,
          ),
        };
      });
      return id;
    },

    addOptimisticMessage: (message) => {
      const id = message.id || generateId();
      const msg: ChatMessage = {
        ...message,
        id,
        metadata: { ...message.metadata, optimistic: true },
      };
      set((state) => {
        const convId = msg.conversationId ?? state.activeConversationId;
        return patchConversationMessages(state, convId, (msgs) => [...msgs, msg]);
      });
      return id;
    },

    confirmOptimisticMessage: (clientId, patch) =>
      set((state) =>
        patchMessageById(state, clientId, (m) =>
          withMetadata({ ...m, ...patch }, { optimistic: false }),
        ),
      ),

    failOptimisticMessage: (clientId, error) =>
      set((state) =>
        patchMessageById(state, clientId, (m) =>
          withMetadata({ ...m, error }, { optimistic: false, failed: true }),
        ),
      ),

    updateMessage: (id, patch) =>
      set((state) => patchMessageById(state, id, (m) => ({ ...m, ...patch }))),

    appendToMessage: (id, chunk) =>
      set((state) => patchMessageById(state, id, (m) => ({ ...m, content: m.content + chunk }))),

    appendToThinking: (id, chunk) =>
      set((state) =>
        patchMessageById(state, id, (m) =>
          withMetadata(m, {
            thinkingContent:
              ((m.metadata?.['thinkingContent'] as string | undefined) ?? '') + chunk,
          }),
        ),
      ),

    setToolTimeline: (id, tools) =>
      set((state) => patchMessageById(state, id, (m) => withMetadata(m, { tools }))),

    updateToolEntry: (id, toolCallId, patch) =>
      set((state) =>
        patchMessageById(state, id, (m) => {
          const tools = (m.metadata?.['tools'] as ChatToolEntry[] | undefined) ?? [];
          const next = tools.map((t) => (t.toolCallId === toolCallId ? { ...t, ...patch } : t));
          return withMetadata(m, { tools: next });
        }),
      ),

    setSearching: (id, isSearching) =>
      set((state) => patchMessageById(state, id, (m) => withMetadata(m, { isSearching }))),

    setSearchResults: (id, results) =>
      set((state) =>
        patchMessageById(state, id, (m) =>
          withMetadata(m, { searchResults: results, isSearching: false }),
        ),
      ),

    setExecutingCode: (id, isExecuting) =>
      set((state) =>
        patchMessageById(state, id, (m) => withMetadata(m, { isExecutingCode: isExecuting })),
      ),

    setCodeExecutionResult: (id, result) =>
      set((state) =>
        patchMessageById(state, id, (m) =>
          withMetadata(m, { codeExecutionResult: result, isExecutingCode: false }),
        ),
      ),

    deleteMessage: (id) =>
      set((state) => {
        const convId = findConversationOfMessage(state, id);
        return patchConversationMessages(state, convId, (msgs) => msgs.filter((m) => m.id !== id));
      }),

    // ---- streaming flags ----
    startStreaming: (id) =>
      set((state) => {
        const patched = patchMessageById(state, id, (m) => ({
          ...m,
          isStreaming: true,
        }));
        return { ...patched, isStreaming: true };
      }),

    stopStreaming: () =>
      set((state) => {
        if (!state.activeConversationId) return { isStreaming: false };
        const patched = patchConversationMessages(state, state.activeConversationId, (msgs) =>
          msgs.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
        );
        return { ...patched, isStreaming: false };
      }),

    setLoading: (loading) => set({ isLoading: loading }),
    setLoadingMessages: (loading) => set({ isLoadingMessages: loading }),
    setError: (error) => set({ error }),
    setSelectedModel: (modelId) => set({ selectedModelId: modelId }),
    reset: () => set({ ...initialState }),

    // ---- async (delegate to port) ----
    loadConversations: async () => {
      if (!port.loadConversations) return;
      set({ isLoading: true, error: null });
      try {
        const conversations = await port.loadConversations();
        set({ conversations, isLoading: false });
      } catch (err) {
        set({
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load conversations',
        });
      }
    },

    loadConversationMessages: async (id) => {
      if (!port.loadConversationMessages) return;
      set({ isLoadingMessages: true, error: null });
      try {
        const messages = await port.loadConversationMessages(id);
        set((state) => ({
          isLoadingMessages: false,
          messagesByConversation: {
            ...state.messagesByConversation,
            [id]: messages,
          },
          messages: id === state.activeConversationId ? messages : state.messages,
        }));
      } catch (err) {
        set({
          isLoadingMessages: false,
          error: err instanceof Error ? err.message : 'Failed to load messages',
        });
      }
    },

    send: async (params) => {
      const genId = params.generateId ?? generateId;
      const conversationId = params.conversationId ?? get().ensureActiveConversation();
      const model = params.model ?? get().selectedModelId;
      const nowIso = new Date().toISOString();

      // 1. user message
      const userMessage: ChatMessage = {
        id: genId(),
        conversationId,
        role: 'user',
        content: params.content,
        createdAt: nowIso,
      };
      get().addMessage(userMessage);
      void port.persistMessage?.(conversationId, userMessage);

      // 2. optimistic assistant placeholder
      const assistantMessageId = genId();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        conversationId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        model,
        isStreaming: true,
      };
      get().addMessage(assistantMessage);
      get().startStreaming(assistantMessageId);
      set({ error: null });

      // 3. bind stream callbacks → store actions (names match web useChatStream)
      const callbacks: SendChatCallbacks = {
        onContent: (chunk) => get().appendToMessage(assistantMessageId, chunk),
        onThinking: (chunk) => get().appendToThinking(assistantMessageId, chunk),
        onToolTimeline: (tools) => get().setToolTimeline(assistantMessageId, tools),
        onToolEntry: (toolCallId, patch) =>
          get().updateToolEntry(assistantMessageId, toolCallId, patch),
        onSearching: (isSearching) => get().setSearching(assistantMessageId, isSearching),
        onSearchResults: (results) => get().setSearchResults(assistantMessageId, results),
        onExecutingCode: (isExecuting) => get().setExecutingCode(assistantMessageId, isExecuting),
        onCodeExecutionResult: (result) => get().setCodeExecutionResult(assistantMessageId, result),
        onMessagePatch: (patch) => get().updateMessage(assistantMessageId, patch),
        onDone: () => {
          get().stopStreaming();
          const finalMessage = (get().messagesByConversation[conversationId] ?? []).find(
            (m) => m.id === assistantMessageId,
          );
          if (finalMessage) {
            void port.persistMessage?.(conversationId, finalMessage);
          }
        },
        onError: (message) => {
          get().updateMessage(assistantMessageId, {
            isStreaming: false,
            error: message,
          });
          get().stopStreaming();
          get().setError(message);
        },
      };

      const sendParams: SendChatParams = {
        conversationId,
        assistantMessageId,
        content: params.content,
        model,
        messages: get().messagesByConversation[conversationId] ?? [],
        ...(params.webSearch !== undefined ? { webSearch: params.webSearch } : {}),
        ...(params.thinkingEnabled !== undefined
          ? { thinkingEnabled: params.thinkingEnabled }
          : {}),
        ...(params.codeExecution !== undefined ? { codeExecution: params.codeExecution } : {}),
        ...(params.effort !== undefined ? { effort: params.effort } : {}),
        ...(params.extra !== undefined ? { extra: params.extra } : {}),
        ...(params.signal !== undefined ? { signal: params.signal } : {}),
      };

      try {
        await port.sendChat(sendParams, callbacks);
      } catch (err) {
        callbacks.onError(err instanceof Error ? err.message : 'Failed to send message');
      }
    },
  }));
}
