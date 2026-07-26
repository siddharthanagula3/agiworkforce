/**
 * AGI Cloud conversation store — PHYSICAL SEPARATION from local store.
 *
 * HARD RULE (founder 2026-06-14): Local mode conversations are stored under
 * 'chat-message-store-local'; Cloud mode conversations are stored here under
 * 'chat-message-store-cloud'. These two MMKV keys must NEVER co-mingle.
 *
 * The ONLY permitted crossing is the explicit user-triggered one-time sync
 * option in Settings > Data Controls (see localCloudSyncService.ts).
 *
 * Cloud conversations come exclusively from the AGI Cloud API (Clerk-authed).
 * Local files, local memory, and local personalisation context are never
 * written into this store or sent to the cloud without explicit user consent.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { providerForExecutionMode } from '@/src/features/chat/utils/conversationMode';
import { useCloudSyncStateStore } from '@/stores/chat/cloudSyncStateStore';
import type { ManagedCloudConversationHistoryStats } from '@agiworkforce/cloud-contracts';
import type { ChatMessage, ConversationSummary } from '@/types/chat';

interface CloudMessageState {
  /** Cloud-only conversations fetched from AGI Cloud API. */
  conversations: ConversationSummary[];
  /** Messages keyed by cloud conversation ID. */
  messages: Record<string, ChatMessage[]>;
  /** Server-authoritative totals for all non-temporary Cloud history. */
  historyStats: ManagedCloudConversationHistoryStats | null;

  /** Replace cloud conversation list with the latest server snapshot. */
  setCloudConversations: (
    cloudConversations: ConversationSummary[],
    historyStats?: ManagedCloudConversationHistoryStats,
  ) => void;
  /** Set cloud messages for a specific conversation. */
  setCloudMessages: (conversationId: string, messages: ChatMessage[]) => void;
  /** Remove a single message from a cloud conversation's cached message list. */
  deleteCloudMessage: (conversationId: string, messageId: string) => void;
  /** Add a new cloud conversation (returned from POST /api/chat/conversations). */
  addCloudConversation: (conversation: ConversationSummary) => void;
  /** Update a cloud conversation's metadata in-place. */
  patchCloudConversation: (id: string, patch: Partial<ConversationSummary>) => void;
  /** Remove a cloud conversation from local cache. */
  removeCloudConversation: (id: string) => void;
  /** Clear all cached cloud data (e.g. on sign-out). */
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
        // Preserve every locally-dirty mutation so a paginated/stale list snapshot
        // cannot revert it or drop a create that has not appeared in that page yet.
        // A later delta tombstone remains authoritative and removes the record.
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

      clearCloudData: () => {
        set({ conversations: [], messages: {}, historyStats: null });
      },
    }),
    {
      // SEPARATION-FIX: dedicated MMKV key for Cloud data — never shared with
      // the local store key 'chat-message-store-local'.
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
        // Only persist cloud conversations — enforced by the executionMode guard
        // at write-time (setCloudConversations + addCloudConversation). Temporary
        // conversations are excluded so they never survive relaunch.
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
