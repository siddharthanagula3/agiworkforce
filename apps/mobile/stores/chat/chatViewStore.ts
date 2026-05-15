import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';

/** Chat mode — determines how the AI processes the conversation. */
export type ChatMode = 'chat' | 'research' | 'create';

/** Per-chat response style. */
export type ChatStyle = 'normal' | 'concise' | 'detailed' | 'creative';

/** Per-chat tool loading strategy. */
export type ToolAccess = 'auto' | 'on-demand' | 'always';

/** Feature toggles available in the "Add to Chat" sheet. */
export interface ChatFeatures {
  webSearch: boolean;
  imageGen: boolean;
  health: boolean;
}

interface ViewState {
  searchQuery: string;
  searchResults: Array<{
    conversationId: string;
    messageId: string;
    snippet: string;
    matchStart?: number;
    matchLength?: number;
  }>;
  isSearching: boolean;
  chatMode: ChatMode;
  chatStyle: ChatStyle;
  toolAccess: ToolAccess;
  features: ChatFeatures;

  searchConversations: (query: string) => void;
  setChatMode: (mode: ChatMode) => void;
  setChatStyle: (style: ChatStyle) => void;
  setToolAccess: (access: ToolAccess) => void;
  setFeature: (feature: keyof ChatFeatures, enabled: boolean) => void;
}

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

export const useChatViewStore = create<ViewState>()(
  persist(
    (set, get) => ({
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      chatMode: 'chat',
      chatStyle: 'normal',
      toolAccess: 'auto',
      features: { webSearch: true, imageGen: true, health: false },

      searchConversations: (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) {
          if (searchDebounceTimer !== undefined) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = undefined;
          }
          set({ searchQuery: '', searchResults: [], isSearching: false });
          return;
        }

        set({ searchQuery: trimmed, isSearching: true });

        if (searchDebounceTimer !== undefined) {
          clearTimeout(searchDebounceTimer);
        }

        searchDebounceTimer = setTimeout(() => {
          searchDebounceTimer = undefined;
          // Import lazily at call-time to avoid circular dep at module load
          /* eslint-disable @typescript-eslint/no-require-imports */
          const { useChatMessageStore } =
            require('@/stores/chat/chatMessageStore') as typeof import('@/stores/chat/chatMessageStore');
          /* eslint-enable @typescript-eslint/no-require-imports */
          const msgState = useChatMessageStore.getState();

          const lower = trimmed.toLowerCase();
          const results: Array<{
            conversationId: string;
            messageId: string;
            snippet: string;
            matchStart?: number;
            matchLength?: number;
          }> = [];

          for (const [convId, msgs] of Object.entries(msgState.messages)) {
            for (const msg of msgs) {
              const contentLower = (msg.content ?? '').toLowerCase();
              const idx = contentLower.indexOf(lower);
              if (idx !== -1) {
                const start = Math.max(0, idx - 30);
                const end = Math.min(msg.content.length, idx + lower.length + 30);
                const snippet =
                  (start > 0 ? '...' : '') +
                  msg.content.slice(start, end) +
                  (end < msg.content.length ? '...' : '');
                results.push({
                  conversationId: convId,
                  messageId: msg.id,
                  snippet,
                  matchStart: idx - start + (start > 0 ? 3 : 0),
                  matchLength: trimmed.length,
                });
                break;
              }
            }
          }

          for (const conv of msgState.conversations) {
            const titleLower = conv.title.toLowerCase();
            const idx = titleLower.indexOf(lower);
            if (idx !== -1 && !results.some((r) => r.conversationId === conv.id)) {
              results.push({
                conversationId: conv.id,
                messageId: '',
                snippet: conv.title,
                matchStart: idx,
                matchLength: trimmed.length,
              });
            }
          }

          // Re-read current state after async gap
          void get();
          set({ searchResults: results, isSearching: false });
        }, 300);
      },

      setChatMode: (mode) => set({ chatMode: mode }),
      setChatStyle: (style) => set({ chatStyle: style }),
      setToolAccess: (access) => set({ toolAccess: access }),
      setFeature: (feature, enabled) =>
        set((state) => ({ features: { ...state.features, [feature]: enabled } })),
    }),
    {
      name: 'chat-view-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        chatMode: state.chatMode,
        chatStyle: state.chatStyle,
        toolAccess: state.toolAccess,
        features: state.features,
      }),
    },
  ),
);
