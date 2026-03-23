import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Conversation, ChatMessage } from '../lib/types';
import { getTemporalGroup } from '../lib/utils';

/** SSR-safe localStorage fallback (returns no-op storage when window is undefined). */
const noopStorage: Storage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  length: 0,
  clear: () => {},
  key: () => null,
};

interface ChatState {
  conversations: Conversation[];
  messages: Record<string, ChatMessage[]>;
  currentConversationId: string | null;
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  searchQuery: string;
  searchResults: Conversation[];
  draftContent: string;

  // Actions
  setCurrentConversation: (id: string | null) => void;
  addConversation: (conv: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;
  setConversations: (convs: Conversation[]) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  appendToStreamingContent: (content: string) => void;
  appendToStreamingReasoning: (reasoning: string) => void;
  startStreaming: () => void;
  stopStreaming: () => void;
  setMessages: (conversationId: string, messages: ChatMessage[]) => void;
  setSearchQuery: (query: string) => void;
  setDraftContent: (content: string) => void;
  pinConversation: (id: string, pinned: boolean) => void;
  archiveConversation: (id: string) => void;
  getGroupedConversations: () => Record<string, Conversation[]>;
}

export const useChatStore = create<ChatState>()(
  persist(
    immer((set, get) => ({
      conversations: [],
      messages: {},
      currentConversationId: null,
      isStreaming: false,
      streamingContent: '',
      streamingReasoning: '',
      searchQuery: '',
      searchResults: [],
      draftContent: '',

      setCurrentConversation: (id) => set({ currentConversationId: id }),

      addConversation: (conv) =>
        set((state) => {
          state.conversations.unshift(conv);
        }),

      updateConversation: (id, updates) =>
        set((state) => {
          const idx = state.conversations.findIndex((c) => c.id === id);
          if (idx !== -1) {
            Object.assign(state.conversations[idx]!, updates);
          }
        }),

      removeConversation: (id) =>
        set((state) => {
          state.conversations = state.conversations.filter((c) => c.id !== id);
          delete state.messages[id];
          if (state.currentConversationId === id) {
            state.currentConversationId = null;
          }
        }),

      setConversations: (convs) => set({ conversations: convs }),

      addMessage: (conversationId, message) =>
        set((state) => {
          if (!state.messages[conversationId]) {
            state.messages[conversationId] = [];
          }
          state.messages[conversationId]!.push(message);
        }),

      updateMessage: (conversationId, messageId, updates) =>
        set((state) => {
          const msgs = state.messages[conversationId];
          if (msgs) {
            const idx = msgs.findIndex((m) => m.id === messageId);
            if (idx !== -1) {
              Object.assign(msgs[idx]!, updates);
            }
          }
        }),

      appendToStreamingContent: (content) =>
        set((state) => {
          state.streamingContent += content;
        }),

      appendToStreamingReasoning: (reasoning) =>
        set((state) => {
          state.streamingReasoning += reasoning;
        }),

      startStreaming: () =>
        set({ isStreaming: true, streamingContent: '', streamingReasoning: '' }),

      stopStreaming: () => set({ isStreaming: false }),

      setMessages: (conversationId, messages) =>
        set((state) => {
          state.messages[conversationId] = messages;
        }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setDraftContent: (content) => set({ draftContent: content }),

      pinConversation: (id, pinned) =>
        set((state) => {
          const idx = state.conversations.findIndex((c) => c.id === id);
          if (idx !== -1) {
            state.conversations[idx]!.pinned = pinned;
          }
        }),

      archiveConversation: (id) =>
        set((state) => {
          const idx = state.conversations.findIndex((c) => c.id === id);
          if (idx !== -1) {
            state.conversations[idx]!.archived = true;
          }
        }),

      getGroupedConversations: () => {
        const { conversations, searchQuery } = get();
        const filtered = searchQuery
          ? conversations.filter(
              (c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()) && !c.archived,
            )
          : conversations.filter((c) => !c.archived);

        const pinned = filtered.filter((c) => c.pinned);
        const unpinned = filtered.filter((c) => !c.pinned);

        const groups: Record<string, Conversation[]> = {};
        if (pinned.length > 0) groups['Pinned'] = pinned;

        for (const conv of unpinned) {
          const group = getTemporalGroup(conv.updatedAt);
          if (!groups[group]) groups[group] = [];
          groups[group]!.push(conv);
        }

        return groups;
      },
    })),
    {
      name: 'agiworkforce-chat-storage',
      version: 1,
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? noopStorage : window.localStorage,
      ),
      partialize: (state) => ({
        conversations: state.conversations,
        messages: state.messages,
        currentConversationId: state.currentConversationId,
      }),
      migrate: (persistedState: unknown, _version: number) => {
        return persistedState as ChatState;
      },
    },
  ),
);
