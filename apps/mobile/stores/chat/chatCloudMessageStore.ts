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
import type { ChatMessage, ConversationSummary } from '@/types/chat';

interface CloudMessageState {
  /** Cloud-only conversations fetched from AGI Cloud API. */
  conversations: ConversationSummary[];
  /** Messages keyed by cloud conversation ID. */
  messages: Record<string, ChatMessage[]>;

  /** Replace cloud conversation list with the latest server snapshot. */
  setCloudConversations: (cloudConversations: ConversationSummary[]) => void;
  /** Set cloud messages for a specific conversation. */
  setCloudMessages: (conversationId: string, messages: ChatMessage[]) => void;
  /** Add a new cloud conversation (returned from POST /api/chat/conversations). */
  addCloudConversation: (conversation: ConversationSummary) => void;
  /** Update a cloud conversation's metadata in-place. */
  patchCloudConversation: (id: string, patch: Partial<ConversationSummary>) => void;
  /** Remove a cloud conversation from local cache. */
  removeCloudConversation: (id: string) => void;
  /** Clear all cached cloud data (e.g. on sign-out). */
  clearCloudData: () => void;
}

export const useChatCloudMessageStore = create<CloudMessageState>()(
  persist(
    (set) => ({
      conversations: [],
      messages: {},

      setCloudConversations: (cloudConversations) => {
        const normalized = cloudConversations.map((c) => ({
          ...c,
          provider: c.provider ?? providerForExecutionMode('cloud'),
          executionMode: c.executionMode ?? ('cloud' as const),
        }));
        set({ conversations: normalized });
      },

      setCloudMessages: (conversationId, messages) => {
        set((state) => ({
          messages: { ...state.messages, [conversationId]: messages },
        }));
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
        set({ conversations: [], messages: {} });
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
        // Only persist cloud conversations — enforced by the executionMode guard
        // at write-time (setCloudConversations + addCloudConversation).
        const conversations = state.conversations.slice(0, MAX_CONVERSATIONS);
        const conversationIds = new Set(conversations.map((c) => c.id));
        const messages: Record<string, ChatMessage[]> = {};
        for (const [id, msgs] of Object.entries(state.messages)) {
          if (conversationIds.has(id)) {
            messages[id] = msgs.filter((m) => !m.isStreaming).slice(-MAX_MESSAGES_PER_CONVERSATION);
          }
        }
        return { conversations, messages };
      },
    },
  ),
);

rehydrateWhenMmkvReady(useChatCloudMessageStore, 'chat-message-store-cloud');
