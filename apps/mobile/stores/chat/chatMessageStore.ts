import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, whenMmkvReady } from '@/lib/mmkv';
import { api } from '@/services/api';
import { useProjectStore } from '@/src/features/projects/store';
import type { ChatMessage, ConversationSummary } from '@/types/chat';
import type { LocalToByokHandoffPreview } from '@agiworkforce/utils/privacy-handoff';

export interface ForkConversationOptions {
  title?: string;
  model?: string;
  handoffPreview?: LocalToByokHandoffPreview;
  handoffAcceptedAt?: string;
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
  deleteMessage: (conversationId: string, messageId: string) => void;
  enqueueOfflineMessage: (
    conversationId: string,
    content: string,
    model: string,
    queueId: string,
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
          const data = await api.get<{ conversations: ConversationSummary[] }>(
            '/api/chat/conversations',
          );
          set({ conversations: data.conversations ?? [] });
        } catch {
          // Keep existing conversations on failure — offline resilience
        } finally {
          set({ isLoadingConversations: false });
        }
      },

      createConversation: async (title?: string, projectId?: string) => {
        const effectiveProjectId =
          projectId ?? useProjectStore.getState().activeProjectId ?? undefined;
        try {
          const data = await api.post<{ conversation: ConversationSummary }>(
            '/api/chat/conversations',
            { title: title ?? 'New Chat', projectId: effectiveProjectId },
          );
          const conversation = { ...data.conversation, projectId: effectiveProjectId };
          set((state) => ({
            conversations: [conversation, ...state.conversations],
            currentConversationId: conversation.id,
            messages: { ...state.messages, [conversation.id]: [] },
          }));
          return conversation.id;
        } catch {
          const localId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          const localConversation: ConversationSummary = {
            id: localId,
            title: title ?? 'New Chat',
            updatedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            messageCount: 0,
            pinned: false,
            projectId: effectiveProjectId,
          };
          set((state) => ({
            conversations: [localConversation, ...state.conversations],
            currentConversationId: localId,
            messages: { ...state.messages, [localId]: [] },
          }));
          return localId;
        }
      },

      forkConversation: async (sourceConversationId, options) => {
        const sourceConversation = get().conversations.find((c) => c.id === sourceConversationId);
        const sourceMessages = get().messages[sourceConversationId] ?? [];
        const forkTitle =
          options?.title ??
          `${sourceConversation?.title ?? 'Chat'} (${options?.model ? 'model' : 'BYOK'} fork)`;
        const handoffPreview = options?.handoffPreview;
        if (handoffPreview) {
          assertLocalToByokHandoffPreview(handoffPreview);
        }
        const forkId = await get().createConversation(forkTitle, sourceConversation?.projectId);
        const now = Date.now();
        const forkedMessages = handoffPreview
          ? [buildAcceptedHandoffMessage(forkId, handoffPreview, options, now)]
          : sourceMessages.map((message, index) => {
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
                model: options?.model ?? message.model,
              };
            });

        set((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === forkId
              ? {
                  ...conversation,
                  messageCount: forkedMessages.length,
                  model: options?.model ?? conversation.model,
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
        set((state) => {
          const { [id]: _, ...remainingMessages } = state.messages;
          return {
            conversations: state.conversations.filter((c) => c.id !== id),
            messages: remainingMessages,
            currentConversationId:
              state.currentConversationId === id ? null : state.currentConversationId,
          };
        });
        try {
          await api.delete(`/api/chat/conversations/${id}`);
        } catch {
          // Optimistic delete stands — offline resilience
        }
      },

      loadMessages: async (conversationId) => {
        const existing = get().messages[conversationId];
        if (existing && existing.length > 0 && !existing.some((m) => m.isStreaming)) return;

        set({ isLoadingMessages: true });
        try {
          const data = await api.get<{ messages: ChatMessage[] }>(
            `/api/chat/conversations/${conversationId}`,
          );
          set((state) => ({
            messages: { ...state.messages, [conversationId]: data.messages ?? [] },
          }));
        } catch {
          set((state) => ({
            messages: {
              ...state.messages,
              [conversationId]: state.messages[conversationId] ?? [],
            },
          }));
        } finally {
          set({ isLoadingMessages: false });
        }
      },

      renameConversation: async (id, title) => {
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
        }));
        try {
          await api.put(`/api/chat/conversations/${id}`, { title });
        } catch {
          // Optimistic rename stands
        }
      },

      pinConversation: async (id) => {
        const conv = get().conversations.find((c) => c.id === id);
        if (!conv) return;
        const pinned = !conv.pinned;
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === id ? { ...c, pinned } : c)),
        }));
        try {
          await api.put(`/api/chat/conversations/${id}`, { pinned });
        } catch {
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === id ? { ...c, pinned: !pinned } : c,
            ),
          }));
        }
      },

      makeConversationPermanent: (id) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, temporary: false } : c,
          ),
        }));
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
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
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
      name: 'chat-message-store',
      storage: createJSONStorage(() => mmkvStorage),
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[chatMessageStore] Hydration failed:', error);
      },
      partialize: (state) => {
        const MAX_CONVERSATIONS = 200;
        const MAX_MESSAGES_PER_CONVERSATION = 100;
        const conversations = state.conversations.slice(0, MAX_CONVERSATIONS);
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

// TODO(audit 2026-05-20, §17): migrate to rehydrateWhenMmkvReady() from
// @/lib/mmkv — see notificationPrefsStore / desktopStatusStore / projectStore
// for the canonical pattern. Tracked as part of the MMKV-RACE cleanup.
whenMmkvReady(() => {
  useChatMessageStore.persist.rehydrate();
});

function assertLocalToByokHandoffPreview(preview: LocalToByokHandoffPreview): void {
  if (preview.redactionReport.blocked || preview.draft.redactionReport.blocked) {
    throw new Error('Blocked Local to BYOK handoff preview cannot be forked.');
  }
  if (preview.draft.targetPrivacyMode !== 'byok') {
    throw new Error('Local to BYOK fork requires a BYOK handoff draft.');
  }
  if (preview.draft.targetProviderMode !== 'DirectByok') {
    throw new Error('Local to BYOK fork requires direct BYOK provider mode.');
  }
  if (!preview.draft.previewHashSha256 || preview.draft.previewHashSha256.length < 16) {
    throw new Error('Local to BYOK fork requires preview hash evidence.');
  }

  const idHashPrefix = preview.draft.id.replace(/^handoff-/, '');
  if (!preview.draft.previewHashSha256.startsWith(idHashPrefix)) {
    throw new Error('Local to BYOK handoff draft hash does not match its id.');
  }
}

function buildAcceptedHandoffMessage(
  forkId: string,
  preview: LocalToByokHandoffPreview,
  options: ForkConversationOptions | undefined,
  now: number,
): ChatMessage {
  const acceptedAt = options?.handoffAcceptedAt ?? new Date(now).toISOString();
  const draft = { ...preview.draft, consentedAt: acceptedAt };

  return {
    id: `${preview.draft.id}_accepted_${now}`,
    conversationId: forkId,
    role: 'system',
    content: [
      'Local to BYOK handoff accepted.',
      'Only this redacted preview payload is available in the BYOK fork. The original Local thread remains on device and is not copied into this conversation.',
      preview.redactedPayload,
    ].join('\n\n'),
    createdAt: acceptedAt,
    model: options?.model,
    metadata: {
      kind: 'local_to_byok_handoff',
      sourceSessionId: preview.draft.sourceSessionId,
      handoffDraft: draft,
      previewHashSha256: preview.draft.previewHashSha256,
      redactionReport: preview.redactionReport,
      selectedContext: preview.draft.selectedContext,
      sourceMessagePolicy: 'redacted_preview_only',
    },
  };
}
