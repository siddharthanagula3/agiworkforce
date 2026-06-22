import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { api } from '@/services/api';
import { useProjectStore } from '@/src/features/projects/store';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  executionModeForConversation,
  executionModeForModel,
  providerForExecutionMode,
  type ConversationExecutionMode,
} from '@/src/features/chat/utils/conversationMode';
import type { ChatMessage, ConversationSummary } from '@/types/chat';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { markConversationForSync } from '@/services/cloudSyncEngine';
// SEPARATION-FIX: cloud conversations are physically separated into their own store.
// Lazy import to avoid circular dependency at module initialisation time.
function getCloudStore() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useChatCloudMessageStore } =
    require('@/stores/chat/chatCloudMessageStore') as typeof import('@/stores/chat/chatCloudMessageStore');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return useChatCloudMessageStore;
}
export { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';

export interface ForkConversationOptions {
  title?: string;
  model?: string;
}

interface MessageState {
  conversations: ConversationSummary[];
  currentConversationId: string | null;
  messages: Record<string, ChatMessage[]>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;

  setCurrentConversationId: (id: string | null) => void;
  loadConversations: () => Promise<void>;
  createConversation: (title?: string, projectId?: string) => Promise<string>;
  forkConversation: (
    sourceConversationId: string,
    options?: ForkConversationOptions,
  ) => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  pinConversation: (id: string) => Promise<void>;
  makeConversationPermanent: (id: string) => void;
  markConversationRead: (id: string) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  enqueueOfflineMessage: (
    conversationId: string,
    content: string,
    model: string,
    queueId: string,
  ) => void;
  beginImageGeneration: (
    conversationId: string,
    commandContent: string,
    prompt: string,
    model: string,
  ) => string;
  completeImageGeneration: (
    conversationId: string,
    assistantMessageId: string,
    result: { imageUrl: string; revisedPrompt?: string; model?: string },
  ) => void;
  failImageGeneration: (
    conversationId: string,
    assistantMessageId: string,
    errorMessage: string,
  ) => void;
  resolveOfflineMessage: (conversationId: string, queueId: string) => void;
  clearQueuedPlaceholders: (conversationId: string) => void;
}

export const useChatMessageStore = create<MessageState>()(
  persist(
    (set, get) => ({
      conversations: [],
      currentConversationId: null,
      messages: {},
      isLoadingConversations: false,
      isLoadingMessages: false,

      setCurrentConversationId: (id) => {
        set({ currentConversationId: id });
      },

      loadConversations: async () => {
        set({ isLoadingConversations: true });
        try {
          // SEPARATION-FIX: Cloud conversations fetched from the API are routed
          // to useChatCloudMessageStore, never written into this local store.
          // This store only holds Local Mode conversations.
          if (shouldLoadCloudConversationList()) {
            const data = await api.get<{ conversations: ConversationSummary[] }>(
              '/api/chat/conversations',
            );
            getCloudStore()
              .getState()
              .setCloudConversations(data.conversations ?? []);
          }
        } catch {
          // Keep existing conversations on failure — offline resilience
        } finally {
          set({ isLoadingConversations: false });
        }
      },

      createConversation: async (title?: string, projectId?: string) => {
        const selectedModel = useModelStore.getState().selectedModel;
        const requestedMode = useChatAppModeStore.getState().appMode;
        const effectiveProjectId =
          requestedMode === 'local'
            ? (projectId ?? useProjectStore.getState().activeProjectId ?? undefined)
            : resolveCloudProjectId(projectId);
        const selectedModelMode = executionModeForModel(selectedModel);
        const conversationModel = selectedModelMode === requestedMode ? selectedModel : undefined;

        return createConversationForMode(
          set,
          title,
          effectiveProjectId,
          conversationModel,
          requestedMode,
        );
      },

      forkConversation: async (sourceConversationId, options) => {
        const sourceConversation = get().conversations.find((c) => c.id === sourceConversationId);
        const sourceMessages = get().messages[sourceConversationId] ?? [];
        const sourceMode = sourceConversation
          ? executionModeForConversation(sourceConversation)
          : executionModeForModel(options?.model);
        const requestedModelMode = options?.model
          ? executionModeForModel(options.model)
          : sourceMode;
        const forkModel =
          options?.model && requestedModelMode === sourceMode
            ? options.model
            : sourceConversation?.model;
        const forkTitle =
          options?.title ??
          `${sourceConversation?.title ?? 'Chat'} (${options?.model ? 'model' : 'copy'} fork)`;
        const forkId = await createConversationForMode(
          set,
          forkTitle,
          // Carry the source chat's project in BOTH modes. The fork stays in
          // sourceMode, so a cloud fork inherits a cloud project id and a local
          // fork a local one — the namespace can never cross. For cloud, re-validate
          // against a live cloud project so a tombstoned id isn't propagated.
          sourceMode === 'local'
            ? sourceConversation?.projectId
            : resolveCloudProjectId(sourceConversation?.projectId),
          forkModel,
          sourceMode,
        );
        const now = Date.now();
        const forkedMessages = sourceMessages.map((message, index) => {
          const {
            isStreaming: _isStreaming,
            isQueued: _isQueued,
            offlineQueueId: _offlineQueueId,
            ...safeMessage
          } = message;

          return {
            ...safeMessage,
            id: `${message.id}_fork_${now}_${index}`,
            conversationId: forkId,
            model: forkModel ?? message.model,
          };
        });

        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === forkId
              ? {
                  ...conversation,
                  messageCount: forkedMessages.length,
                  model: forkModel ?? conversation.model,
                  provider: providerForExecutionMode(sourceMode),
                  executionMode: sourceMode,
                  updatedAt: new Date(now).toISOString(),
                }
              : conversation,
          ),
          messages: { ...state.messages, [forkId]: forkedMessages },
          currentConversationId: forkId,
        }));

        return forkId;
      },

      deleteConversation: async (id) => {
        // SEPARATION-FIX: check local store first; if not found, delegate to cloud store.
        const localConversation = get().conversations.find((c) => c.id === id);
        if (!localConversation) {
          const cloudStore = getCloudStore();
          const cloudConversation = cloudStore.getState().conversations.find((c) => c.id === id);
          if (cloudConversation && shouldSyncConversationRemote(cloudConversation)) {
            cloudStore.getState().removeCloudConversation(id);
            try {
              await api.delete(`/api/chat/conversations/${id}`);
            } catch {
              // Optimistic delete stands — offline resilience
            }
          } else {
            cloudStore.getState().removeCloudConversation(id);
          }
          set((state) => ({
            currentConversationId:
              state.currentConversationId === id ? null : state.currentConversationId,
          }));
          return;
        }
        set((state) => {
          const { [id]: _, ...remainingMessages } = state.messages;
          return {
            conversations: state.conversations.filter((c) => c.id !== id),
            messages: remainingMessages,
            currentConversationId:
              state.currentConversationId === id ? null : state.currentConversationId,
          };
        });
      },

      loadMessages: async (conversationId) => {
        // SEPARATION-FIX: check which store owns this conversation.
        const localConversation = get().conversations.find((c) => c.id === conversationId);
        const cloudStore = getCloudStore();
        const cloudConversation = !localConversation
          ? cloudStore.getState().conversations.find((c) => c.id === conversationId)
          : undefined;
        const conversation = localConversation ?? cloudConversation;

        const existingLocalMsgs = get().messages[conversationId];
        const existingCloudMsgs = cloudStore.getState().messages[conversationId];
        const existing = localConversation ? existingLocalMsgs : existingCloudMsgs;
        if (existing && existing.length > 0 && !existing.some((m) => m.isStreaming)) return;

        set({ isLoadingMessages: true });
        try {
          if (!shouldLoadRemoteMessages(conversation)) return;
          const data = await api.get<{ messages: ChatMessage[] }>(
            `/api/chat/conversations/${conversationId}`,
          );
          // Route messages to the correct store.
          if (cloudConversation) {
            cloudStore.getState().setCloudMessages(conversationId, data.messages ?? []);
          } else {
            set((state) => ({
              messages: { ...state.messages, [conversationId]: data.messages ?? [] },
            }));
          }
        } catch {
          if (!cloudConversation) {
            set((state) => ({
              messages: {
                ...state.messages,
                [conversationId]: state.messages[conversationId] ?? [],
              },
            }));
          }
        } finally {
          set({ isLoadingMessages: false });
        }
      },

      renameConversation: async (id, title) => {
        // SEPARATION-FIX: route to the store that owns this conversation.
        const localConversation = get().conversations.find((c) => c.id === id);
        if (!localConversation) {
          const cloudStore = getCloudStore();
          cloudStore.getState().patchCloudConversation(id, { title });
          if (
            shouldSyncConversationRemote(
              cloudStore.getState().conversations.find((c) => c.id === id),
            )
          ) {
            try {
              await api.put(`/api/chat/conversations/${id}`, { title });
            } catch {
              // Optimistic rename stands
            }
          }
          return;
        }
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
        }));
      },

      pinConversation: async (id) => {
        // SEPARATION-FIX: route to the store that owns this conversation.
        const localConv = get().conversations.find((c) => c.id === id);
        if (!localConv) {
          const cloudStore = getCloudStore();
          const cloudConv = cloudStore.getState().conversations.find((c) => c.id === id);
          if (!cloudConv) return;
          const pinned = !cloudConv.pinned;
          cloudStore.getState().patchCloudConversation(id, { pinned });
          if (shouldSyncConversationRemote(cloudConv)) {
            try {
              await api.put(`/api/chat/conversations/${id}`, { pinned });
            } catch {
              cloudStore.getState().patchCloudConversation(id, { pinned: !pinned });
            }
          }
          return;
        }
        const pinned = !localConv.pinned;
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === id ? { ...c, pinned } : c)),
        }));
      },

      makeConversationPermanent: (id) => {
        // Route to the correct store.
        if (get().conversations.find((c) => c.id === id)) {
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === id ? { ...c, temporary: false } : c,
            ),
          }));
        } else {
          getCloudStore().getState().patchCloudConversation(id, { temporary: false });
        }
      },

      markConversationRead: (id) => {
        // Route to the correct store.
        if (get().conversations.find((c) => c.id === id)) {
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === id ? { ...c, unread: false } : c,
            ),
          }));
        } else {
          getCloudStore().getState().patchCloudConversation(id, { unread: false });
        }
      },

      deleteMessage: (conversationId, messageId) => {
        set((state) => {
          const msgs = state.messages[conversationId];
          if (!msgs) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: msgs.filter((m) => m.id !== messageId),
            },
          };
        });
      },

      enqueueOfflineMessage: (conversationId, content, model, queueId) => {
        const userMessage: ChatMessage = {
          id: generateMessageId(),
          conversationId,
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
          model,
          isQueued: true,
          offlineQueueId: queueId,
        };
        set((state) => {
          const existing = state.messages[conversationId] ?? [];
          return {
            messages: { ...state.messages, [conversationId]: [...existing, userMessage] },
          };
        });
      },

      beginImageGeneration: (conversationId, commandContent, prompt, model) => {
        const now = new Date().toISOString();
        const assistantMessageId = generateMessageId();
        const userMessage: ChatMessage = {
          id: generateMessageId(),
          conversationId,
          role: 'user',
          content: commandContent,
          createdAt: now,
          model,
        };
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          conversationId,
          role: 'assistant',
          content: '',
          createdAt: now,
          model,
          isGeneratingImage: true,
          imageGenStatus: 'generating',
          imageGenProgress: 0,
          imageGenPrompt: prompt,
        };

        set((state) => {
          const existingMessages = state.messages[conversationId] ?? [];
          return {
            messages: {
              ...state.messages,
              [conversationId]: [...existingMessages, userMessage, assistantMessage],
            },
            conversations: state.conversations.map((conversation) =>
              conversation.id === conversationId
                ? {
                    ...conversation,
                    lastMessage: commandContent,
                    messageCount: (conversation.messageCount ?? 0) + 2,
                    updatedAt: now,
                    model: conversation.model ?? model,
                    provider: conversation.provider ?? providerForExecutionMode('cloud'),
                    executionMode: conversation.executionMode ?? 'cloud',
                  }
                : conversation,
            ),
          };
        });

        return assistantMessageId;
      },

      completeImageGeneration: (conversationId, assistantMessageId, result) => {
        const now = new Date().toISOString();
        const finalContent = result.revisedPrompt
          ? `Generated image: ${result.revisedPrompt}`
          : 'Generated image';

        set((state) => {
          const messages = state.messages[conversationId];
          if (!messages) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: messages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      type: 'image',
                      imageUrl: result.imageUrl,
                      revisedPrompt: result.revisedPrompt,
                      content: finalContent,
                      isGeneratingImage: false,
                      imageGenStatus: 'completed',
                      imageGenProgress: 100,
                      imageGenError: undefined,
                      model: result.model ?? message.model,
                    }
                  : message,
              ),
            },
            conversations: state.conversations.map((conversation) =>
              conversation.id === conversationId
                ? {
                    ...conversation,
                    lastMessage: finalContent,
                    updatedAt: now,
                    model: result.model ?? conversation.model,
                    provider: conversation.provider ?? providerForExecutionMode('cloud'),
                    executionMode: conversation.executionMode ?? 'cloud',
                  }
                : conversation,
            ),
          };
        });
      },

      failImageGeneration: (conversationId, assistantMessageId, errorMessage) => {
        const now = new Date().toISOString();
        const finalContent = `Image generation failed: ${errorMessage}`;

        set((state) => {
          const messages = state.messages[conversationId];
          if (!messages) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: messages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: finalContent,
                      isGeneratingImage: false,
                      imageGenStatus: 'failed',
                      imageGenProgress: 100,
                      imageGenError: errorMessage,
                    }
                  : message,
              ),
            },
            conversations: state.conversations.map((conversation) =>
              conversation.id === conversationId
                ? {
                    ...conversation,
                    lastMessage: finalContent,
                    updatedAt: now,
                  }
                : conversation,
            ),
          };
        });
      },

      resolveOfflineMessage: (conversationId, queueId) => {
        set((state) => {
          const msgs = state.messages[conversationId];
          if (!msgs) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: msgs.filter((m) => m.offlineQueueId !== queueId),
            },
          };
        });
      },

      clearQueuedPlaceholders: (conversationId) => {
        set((state) => {
          const msgs = state.messages[conversationId];
          if (!msgs) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: msgs.filter((m) => !m.isStreaming && !m.isQueued),
            },
          };
        });
      },
    }),
    {
      // SEPARATION-FIX: Local conversations persist under a dedicated Local key.
      // Cloud conversations are persisted separately in `useChatCloudMessageStore`
      // under 'chat-message-store-cloud'. The two namespaces never share keys in
      // MMKV, ensuring physical separation between Local and Cloud data at rest.
      name: 'chat-message-store-local',
      storage: createJSONStorage(() => mmkvStorage),
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[chatMessageStore] Hydration failed:', error);
      },
      partialize: (state) => {
        const MAX_CONVERSATIONS = 200;
        const MAX_MESSAGES_PER_CONVERSATION = 100;
        // SEPARATION-FIX: only persist LOCAL conversations in this store.
        // Cloud conversations must never co-mingle with local storage.
        const conversations = state.conversations
          .filter((c) => executionModeForConversation(c) === 'local')
          .slice(0, MAX_CONVERSATIONS);
        const conversationIds = new Set(conversations.map((c) => c.id));
        const messages: Record<string, ChatMessage[]> = {};
        for (const [id, msgs] of Object.entries(state.messages)) {
          if (conversationIds.has(id)) {
            messages[id] = msgs.filter((m) => !m.isStreaming).slice(-MAX_MESSAGES_PER_CONVERSATION);
          }
        }
        return { conversations, messages, currentConversationId: state.currentConversationId };
      },
    },
  ),
);

function isCloudChatEnabled(): boolean {
  return FEATURES.cloudChat && !FEATURES.v1LocalOnly;
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function shouldLoadCloudConversationList(): boolean {
  return isCloudChatEnabled() && useChatAppModeStore.getState().appMode === 'cloud';
}

/**
 * Resolve the cloud project a new/forked cloud chat should be stamped with.
 *
 * TRUST BOUNDARY: reads ONLY the cloud project store, never the local one, and
 * validates the candidate (explicit id, else the cloud active project) against a
 * LIVE (non-tombstoned) cloud project. A local project id, an unknown id, or a
 * tombstoned id all resolve to `undefined` — so a cloud chat can never be stamped
 * with a cross-namespace or dangling project_id.
 */
function resolveCloudProjectId(explicit?: string): string | undefined {
  const { activeProjectId, projects } = useCloudProjectStore.getState();
  const candidate = explicit ?? activeProjectId ?? undefined;
  if (!candidate) return undefined;
  return projects.some((p) => p.id === candidate && p.deletedAt === null) ? candidate : undefined;
}

function isCloudConversation(conversation: ConversationSummary | undefined): boolean {
  return Boolean(conversation && executionModeForConversation(conversation) === 'cloud');
}

function shouldSyncConversationRemote(conversation: ConversationSummary | undefined): boolean {
  return isCloudChatEnabled() && isCloudConversation(conversation);
}

function shouldLoadRemoteMessages(conversation: ConversationSummary | undefined): boolean {
  if (!isCloudChatEnabled()) return false;
  if (conversation) return isCloudConversation(conversation);
  return useChatAppModeStore.getState().appMode === 'cloud';
}

// mergeCloudConversations removed: cloud conversations no longer write into
// the local store. They are stored exclusively in useChatCloudMessageStore
// under 'chat-message-store-cloud'. See SEPARATION-FIX comments above.

async function createConversationForMode(
  set: (
    partial: Partial<MessageState> | ((state: MessageState) => Partial<MessageState>),
    replace?: false,
  ) => void,
  title: string | undefined,
  projectId: string | undefined,
  model: string | undefined,
  executionMode: ConversationExecutionMode,
): Promise<string> {
  if (executionMode === 'local') {
    return createStoredConversation(set, title, projectId, model, executionMode);
  }

  if (!isCloudChatEnabled()) {
    throw new Error('AGI Cloud chat is not enabled in this mobile build.');
  }

  try {
    // Offline-first: generate the cloud identity (UUIDv7) client-side so the
    // conversation has a stable id the sync engine can push, independent of the
    // server round-trip. The create endpoint accepts and echoes this id.
    const id = uuidv7();
    const data = await api.post<{ conversation: ConversationSummary }>('/api/chat/conversations', {
      id,
      title: title ?? 'New Chat',
      projectId,
    });
    const conversation: ConversationSummary = {
      ...data.conversation,
      id: data.conversation?.id ?? id,
      projectId,
      model: data.conversation.model ?? model,
      provider: data.conversation.provider ?? providerForExecutionMode('cloud'),
      executionMode: data.conversation.executionMode ?? 'cloud',
    };
    // SEPARATION-FIX: cloud conversation goes to the cloud store, NOT the local store.
    // The local store `set` function is intentionally not called here.
    getCloudStore().getState().addCloudConversation(conversation);
    // Queue the conversation for the next sync push (metadata LWW-reconciles cross-device).
    markConversationForSync(conversation.id);
    // currentConversationId is shared UI state, not conversation data — safe to set here.
    set(() => ({ currentConversationId: conversation.id }));
    return conversation.id;
  } catch {
    throw new Error('AGI Cloud conversation could not be created.');
  }
}

function createStoredConversation(
  set: (
    partial: Partial<MessageState> | ((state: MessageState) => Partial<MessageState>),
    replace?: false,
  ) => void,
  title: string | undefined,
  projectId: string | undefined,
  model: string | undefined,
  executionMode: ConversationExecutionMode,
): string {
  const localId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  const localConversation: ConversationSummary = {
    id: localId,
    title: title ?? 'New Chat',
    updatedAt: now,
    createdAt: now,
    messageCount: 0,
    pinned: false,
    projectId,
    model,
    provider: providerForExecutionMode(executionMode),
    executionMode,
  };
  set((state) => ({
    conversations: [localConversation, ...state.conversations],
    currentConversationId: localId,
    messages: { ...state.messages, [localId]: [] },
  }));
  return localId;
}

rehydrateWhenMmkvReady(useChatMessageStore, 'chat-message-store-local');
