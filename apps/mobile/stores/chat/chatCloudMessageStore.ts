import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { providerForExecutionMode } from '@/src/features/chat/utils/conversationMode';
import { useCloudSyncStateStore } from '@/stores/chat/cloudSyncStateStore';
import type { ManagedCloudConversationHistoryStats } from '@agiworkforce/cloud-contracts';
import type { ChatMessage, ConversationSummary } from '@/types/chat';

interface CloudMessageState {
  conversations: ConversationSummary[];
  messages: Record<string, ChatMessage[]>;
  historyStats: ManagedCloudConversationHistoryStats | null;

  setCloudConversations: (
    cloudConversations: ConversationSummary[],
    historyStats?: ManagedCloudConversationHistoryStats,
  ) => void;
  setCloudMessages: (conversationId: string, messages: ChatMessage[]) => void;
  deleteCloudMessage: (conversationId: string, messageId: string) => void;
  addCloudConversation: (conversation: ConversationSummary) => void;
  patchCloudConversation: (id: string, patch: Partial<ConversationSummary>) => void;
  removeCloudConversation: (id: string) => void;
  /**
   * Put back a conversation an optimistic delete removed, at the position it
   * held, together with any messages that were dropped with it. Appending
   * instead would silently reorder the list after a failed delete.
   */
  restoreCloudConversation: (
    conversation: ConversationSummary,
    index: number,
    messages?: ChatMessage[],
  ) => void;
  clearCloudData: () => void;
}

function stripEphemeralGeneratedImage(message: ChatMessage): ChatMessage {
  if (message.imageGenPersisted !== false) return message;
  return {
    ...message,
    imageUrl: undefined,
    imageGenError:
      message.imageGenError ??
      'This image was available for one session only and was not saved to AGI Cloud.',
  };
}

export const useChatCloudMessageStore = create<CloudMessageState>()(
  persist(
    (set) => ({
      conversations: [],
      messages: {},
      historyStats: null,

      setCloudConversations: (cloudConversations, historyStats) => {
        const dirtyIds = useCloudSyncStateStore.getState().dirtyConversationIds;
        set((state) => {
          const localById = new Map(state.conversations.map((c) => [c.id, c]));
          const normalized = cloudConversations.map((c) => {
            const local = localById.get(c.id);
            const serverVersion = c.serverVersion ?? local?.serverVersion;
            const base: ConversationSummary = {
              ...c,
              provider: c.provider ?? providerForExecutionMode('cloud'),
              executionMode: c.executionMode ?? ('cloud' as const),
              ...(serverVersion !== undefined ? { serverVersion } : {}),
            };
            if (dirtyIds.includes(c.id)) {
              if (local) return { ...base, ...local, serverVersion };
            }
            return base;
          });
          const snapshotIds = new Set(normalized.map((conversation) => conversation.id));
          const dirtyOutsideSnapshot = state.conversations.filter(
            (conversation) =>
              dirtyIds.includes(conversation.id) && !snapshotIds.has(conversation.id),
          );
          return {
            conversations: [...dirtyOutsideSnapshot, ...normalized],
            ...(historyStats ? { historyStats } : {}),
          };
        });
      },

      setCloudMessages: (conversationId, messages) => {
        set((state) => ({
          messages: { ...state.messages, [conversationId]: messages },
        }));
      },

      deleteCloudMessage: (conversationId, messageId) => {
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

      addCloudConversation: (conversation) => {
        const normalized: ConversationSummary = {
          ...conversation,
          provider: conversation.provider ?? providerForExecutionMode('cloud'),
          executionMode: conversation.executionMode ?? 'cloud',
        };
        set((state) => ({
          conversations: [normalized, ...state.conversations],
          messages: { ...state.messages, [normalized.id]: [] },
        }));
      },

      patchCloudConversation: (id, patch) => {
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }));
      },

      removeCloudConversation: (id) => {
        set((state) => {
          const { [id]: _, ...remainingMessages } = state.messages;
          return {
            conversations: state.conversations.filter((c) => c.id !== id),
            messages: remainingMessages,
          };
        });
      },

      restoreCloudConversation: (conversation, index, messages) => {
        set((state) => {
          if (state.conversations.some((c) => c.id === conversation.id)) return state;
          const conversations = [...state.conversations];
          const at = Math.max(0, Math.min(index, conversations.length));
          conversations.splice(at, 0, conversation);
          return {
            conversations,
            ...(messages ? { messages: { ...state.messages, [conversation.id]: messages } } : {}),
          };
        });
      },

      clearCloudData: () => {
        set({ conversations: [], messages: {}, historyStats: null });
      },
    }),
    {
      name: 'chat-message-store-cloud',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[chatCloudMessageStore] Hydration failed:', error);
      },
      partialize: (state) => {
        const MAX_CONVERSATIONS = 200;
        const MAX_MESSAGES_PER_CONVERSATION = 100;
        const syncState = useCloudSyncStateStore.getState();
        const dirtyConversationIds = new Set(syncState.dirtyConversationIds);
        const dirtyMessageIdsByConversation = new Map<string, Set<string>>();
        for (const dirty of syncState.dirtyMessages) {
          const ids = dirtyMessageIdsByConversation.get(dirty.conversationId) ?? new Set<string>();
          ids.add(dirty.messageId);
          dirtyMessageIdsByConversation.set(dirty.conversationId, ids);
        }
        const persistentConversations = state.conversations.filter((c) => !c.temporary);
        const conversations = persistentConversations.slice(0, MAX_CONVERSATIONS);
        const persistedConversationIds = new Set(
          conversations.map((conversation) => conversation.id),
        );
        for (const conversation of persistentConversations) {
          if (
            dirtyConversationIds.has(conversation.id) &&
            !persistedConversationIds.has(conversation.id)
          ) {
            conversations.push(conversation);
            persistedConversationIds.add(conversation.id);
          }
        }
        const conversationIds = new Set(conversations.map((c) => c.id));
        const messages: Record<string, ChatMessage[]> = {};
        for (const [id, msgs] of Object.entries(state.messages)) {
          if (conversationIds.has(id)) {
            const persistentMessages = msgs.filter((message) => !message.isStreaming);
            const selected = persistentMessages.slice(-MAX_MESSAGES_PER_CONVERSATION);
            const selectedIds = new Set(selected.map((message) => message.id));
            const dirtyMessageIds = dirtyMessageIdsByConversation.get(id);
            const dirtyOutsideCap = persistentMessages.filter(
              (message) =>
                dirtyMessageIds?.has(message.id) === true && !selectedIds.has(message.id),
            );
            messages[id] = [...dirtyOutsideCap, ...selected].map(stripEphemeralGeneratedImage);
          }
        }
        return { conversations, messages, historyStats: state.historyStats };
      },
    },
  ),
);

rehydrateWhenMmkvReady(useChatCloudMessageStore, 'chat-message-store-cloud');
