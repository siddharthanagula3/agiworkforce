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

const NEW_CONVERSATION_DRAFT_KEY = '__new_conversation__';

function composerDraftKey(conversationId: string | null): string {
  return conversationId ?? NEW_CONVERSATION_DRAFT_KEY;
}

export type ActiveMode =
  | 'code'
  | 'write'
  | 'learn'
  | 'life'
  | 'research'
  | 'image'
  | 'video'
  | 'computer'
  | 'web'
  | 'skills'
  | null;

const MODE_SYSTEM_PROMPTS: Record<NonNullable<ActiveMode>, string> = {
  code: 'You are an expert coding assistant. Help the user write, debug, and explain code.',
  write:
    'You are a professional writing assistant. Help with drafting, editing, and improving text.',
  learn:
    'You are a knowledgeable tutor. Explain concepts clearly, use examples, and check for understanding.',
  life: 'You are a helpful life assistant. Help with personal tasks, planning, advice, and everyday decisions.',
  research:
    'You are a research assistant. Provide thorough, well-sourced analysis. Use web search when available.',
  image:
    'You are an image generation assistant. Help the user craft prompts and produce compelling visuals.',
  video:
    'You are a video generation assistant. Help the user craft prompts and storyboards for short videos.',
  computer:
    'You are a computer-use assistant. Plan and execute UI actions on the user behalf with care and confirmation.',
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
  /** In-flight turns keyed by origin conversation. Ephemeral; never persisted. */
  streamingConversationIds: Record<string, true>;
  /** Backward-compatible aggregate: true when any conversation is streaming. */
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  searchQuery: string;
  searchResults: Conversation[];
  /** Canonical live composer value for the active conversation. */
  draftContent: string;
  /** In-memory unsent drafts, isolated by conversation (plus the new-chat composer). */
  draftsByConversation: Record<string, string>;
  activeMode: ActiveMode;
  webSearchEnabled: boolean;

  // Actions
  setActiveConversation: (id: string | null) => void;
  addConversation: (conv: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  removeConversation: (id: string) => void;
  setConversations: (convs: Conversation[]) => void;
  /**
   * Replace host-owned conversation state and discard cached data that no
   * longer belongs to the active host boundary. Desktop calls this whenever
   * Local/Cloud mode or the authenticated Cloud account changes.
   */
  replaceHostSnapshot: (convs: Conversation[], activeConversationId: string | null) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  updateMessageMetadata: (
    conversationId: string,
    messageId: string,
    patch: Record<string, unknown>,
  ) => void;
  appendToStreamingContent: (content: string) => void;
  appendToStreamingReasoning: (reasoning: string) => void;
  startStreaming: (conversationId?: string | null) => void;
  stopStreaming: (conversationId?: string | null) => void;
  setMessages: (conversationId: string, messages: ChatMessage[]) => void;
  setSearchQuery: (query: string) => void;
  setDraftContent: (content: string, conversationId?: string | null) => void;
  appendDraftContent: (content: string, conversationId?: string | null) => void;
  clearDraftContent: (conversationId?: string | null) => void;
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
      streamingConversationIds: {},
      isStreaming: false,
      streamingContent: '',
      streamingReasoning: '',
      searchQuery: '',
      searchResults: [],
      draftContent: '',
      draftsByConversation: {},
      activeMode: null,
      // Automatic intent only. The send pipeline still clamps this against
      // the active runtime/model/deployment so "on" never invents capability
      // or crosses a Local/BYOK trust boundary.
      webSearchEnabled: true,

      setActiveConversation: (id) =>
        set((state) => {
          state.activeConversationId = id;
          state.draftContent = state.draftsByConversation[composerDraftKey(id)] ?? '';
        }),

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
          delete state.draftsByConversation[composerDraftKey(id)];
          delete state.streamingConversationIds[id];
          state.isStreaming = Object.keys(state.streamingConversationIds).length > 0;
          if (state.activeConversationId === id) {
            state.activeConversationId = null;
            state.draftContent = state.draftsByConversation[composerDraftKey(null)] ?? '';
          }
        }),

      setConversations: (convs) => set({ conversations: convs }),

      replaceHostSnapshot: (convs, activeConversationId) =>
        set((state) => {
          const previousConversationIds = new Set(
            state.conversations.map((conversation) => conversation.id),
          );
          const allowedConversationIds = new Set(convs.map((conversation) => conversation.id));
          const boundaryReplaced =
            previousConversationIds.size > 0 &&
            [...previousConversationIds].every(
              (conversationId) => !allowedConversationIds.has(conversationId),
            );
          const activeConversationRemoved =
            state.activeConversationId !== null &&
            !allowedConversationIds.has(state.activeConversationId);

          state.conversations = convs;
          state.activeConversationId =
            activeConversationId && allowedConversationIds.has(activeConversationId)
              ? activeConversationId
              : null;

          for (const conversationId of Object.keys(state.messagesByConversation)) {
            if (!allowedConversationIds.has(conversationId)) {
              delete state.messagesByConversation[conversationId];
            }
          }
          for (const draftKey of Object.keys(state.draftsByConversation)) {
            if (draftKey !== NEW_CONVERSATION_DRAFT_KEY && !allowedConversationIds.has(draftKey)) {
              delete state.draftsByConversation[draftKey];
            }
          }

          state.draftContent =
            state.draftsByConversation[composerDraftKey(state.activeConversationId)] ?? '';
          // Host snapshots also fire for ordinary title/sidebar metadata
          // updates. Those must not cancel the shared live-turn projection:
          // the runtime pins streaming to its origin conversation even when
          // the user navigates elsewhere. Reset ephemeral execution/search
          // state only when the host actually replaced the account/trust
          // boundary or removed the active conversation.
          if (boundaryReplaced || activeConversationRemoved) {
            state.searchQuery = '';
            state.searchResults = [];
            state.isStreaming = false;
            state.streamingConversationIds = {};
            state.streamingContent = '';
            state.streamingReasoning = '';
          }
        }),

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

      updateMessageMetadata: (conversationId, messageId, patch) =>
        set((state) => {
          const msgs = state.messagesByConversation[conversationId];
          if (msgs) {
            const idx = msgs.findIndex((m) => m.id === messageId);
            if (idx !== -1) {
              const existing = msgs[idx]!.metadata ?? {};
              msgs[idx]!.metadata = { ...existing, ...patch };
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

      startStreaming: (conversationId) =>
        set((state) => {
          if (conversationId) state.streamingConversationIds[conversationId] = true;
          state.isStreaming = true;
          state.streamingContent = '';
          state.streamingReasoning = '';
        }),

      stopStreaming: (conversationId) =>
        set((state) => {
          if (conversationId) {
            delete state.streamingConversationIds[conversationId];
            state.isStreaming = Object.keys(state.streamingConversationIds).length > 0;
          } else {
            state.streamingConversationIds = {};
            state.isStreaming = false;
          }
        }),

      setMessages: (conversationId, messages) =>
        set((state) => {
          state.messagesByConversation[conversationId] = messages;
        }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setDraftContent: (content, conversationId) =>
        set((state) => {
          const targetConversationId =
            conversationId === undefined ? state.activeConversationId : conversationId;
          const key = composerDraftKey(targetConversationId);
          if (content) {
            state.draftsByConversation[key] = content;
          } else {
            delete state.draftsByConversation[key];
          }
          if (targetConversationId === state.activeConversationId) {
            state.draftContent = content;
          }
        }),

      appendDraftContent: (content, conversationId) =>
        set((state) => {
          if (!content) return;
          const targetConversationId =
            conversationId === undefined ? state.activeConversationId : conversationId;
          const key = composerDraftKey(targetConversationId);
          const existing = state.draftsByConversation[key] ?? '';
          const next = existing ? `${existing}\n\n${content}` : content;
          state.draftsByConversation[key] = next;
          if (targetConversationId === state.activeConversationId) {
            state.draftContent = next;
          }
        }),

      clearDraftContent: (conversationId) =>
        set((state) => {
          const targetConversationId =
            conversationId === undefined ? state.activeConversationId : conversationId;
          delete state.draftsByConversation[composerDraftKey(targetConversationId)];
          if (targetConversationId === state.activeConversationId) {
            state.draftContent = '';
          }
        }),

      setActiveMode: (mode) => set({ activeMode: mode }),

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
      name: 'agi-web-chat',
      // v2: rename `messages` -> `messagesByConversation` and
      // `currentConversationId` -> `activeConversationId` to match desktop.
      // v3: Web search becomes automatic rather than a user preference.
      // The migrate() function below transforms old state on load; new
      // persists intentionally omit the automatic intent flag.
      version: 3,
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
        if (version < 3) {
          // Older builds could persist the now-removed menu toggle as false.
          // Automatic search is the product default; actual execution remains
          // capability- and trust-clamped at send time in useChat.
          state['webSearchEnabled'] = true;
        }
        return state as unknown as ChatState;
      },
    },
  ),
);
