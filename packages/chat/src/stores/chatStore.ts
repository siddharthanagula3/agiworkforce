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

export type ActiveMode = 'code' | 'write' | 'research' | 'web' | 'skills' | null;

const MODE_SYSTEM_PROMPTS: Record<NonNullable<ActiveMode>, string> = {
  code: 'You are an expert coding assistant. Help the user write, debug, and explain code.',
  write:
    'You are a professional writing assistant. Help with drafting, editing, and improving text.',
  research:
    'You are a research assistant. Provide thorough, well-sourced analysis. Use web search when available.',
  web: 'You are a research assistant. Provide thorough, well-sourced analysis. Use web search when available.',
  skills: 'You are a skilled professional assistant with 140+ specialized skills.',
};

export function getSystemPromptForMode(mode: ActiveMode): string | null {
  if (!mode) return null;
  return MODE_SYSTEM_PROMPTS[mode];
}

interface ChatState {
  conversations: Conversation[];
  messagesByConversation: Record<string, ChatMessage[]>;
  activeConversationId: string | null;
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  searchQuery: string;
  searchResults: Conversation[];
  draftContent: string;
  activeMode: ActiveMode;
  webSearchEnabled: boolean;

  // Actions
  setActiveConversation: (id: string | null) => void;
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
  setActiveMode: (mode: ActiveMode) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    immer((set, get) => ({
      conversations: [],
      messagesByConversation: {},
      activeConversationId: null,
      isStreaming: false,
      streamingContent: '',
      streamingReasoning: '',
      searchQuery: '',
      searchResults: [],
      draftContent: '',
      activeMode: null,
      webSearchEnabled: false,

      setActiveConversation: (id) => set({ activeConversationId: id }),

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
          delete state.messagesByConversation[id];
          if (state.activeConversationId === id) {
            state.activeConversationId = null;
          }
        }),

      setConversations: (convs) => set({ conversations: convs }),

      addMessage: (conversationId, message) =>
        set((state) => {
          if (!state.messagesByConversation[conversationId]) {
            state.messagesByConversation[conversationId] = [];
          }
          state.messagesByConversation[conversationId]!.push(message);
        }),

      updateMessage: (conversationId, messageId, updates) =>
        set((state) => {
          const msgs = state.messagesByConversation[conversationId];
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
          state.messagesByConversation[conversationId] = messages;
        }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setDraftContent: (content) => set({ draftContent: content }),

      setActiveMode: (mode) =>
        set({
          activeMode: mode,
          webSearchEnabled: mode === 'web',
        }),

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
      name: 'chat-storage',
      version: 2,
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? noopStorage : window.localStorage,
      ),
      partialize: (state) => ({
        conversations: state.conversations,
        messagesByConversation: state.messagesByConversation,
        activeConversationId: state.activeConversationId,
      }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;
        if (version < 2) {
          // v1 used `messages` and `currentConversationId`; v2 renames them to
          // match the desktop chatStore so both share the same localStorage key.
          if ('messages' in state && !('messagesByConversation' in state)) {
            state['messagesByConversation'] = state['messages'];
            delete state['messages'];
          }
          if ('currentConversationId' in state && !('activeConversationId' in state)) {
            state['activeConversationId'] = state['currentConversationId'];
            delete state['currentConversationId'];
          }
        }
        return state as unknown as ChatState;
      },
    },
  ),
);
