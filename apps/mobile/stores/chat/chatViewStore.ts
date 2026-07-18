import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type { CloudWorkMode } from '@agiworkforce/types';

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
  /** Server-side code execution (E2B sandbox) for this turn — cloud only. */
  codeExecution: boolean;
}

export interface ConversationSearchResult {
  conversationId: string;
  messageId: string;
  snippet: string;
  matchStart?: number;
  matchLength?: number;
}

interface ViewState {
  searchQuery: string;
  searchResults: ConversationSearchResult[];
  isSearching: boolean;
  chatMode: ChatMode;
  workMode: CloudWorkMode;
  chatStyle: ChatStyle;
  toolAccess: ToolAccess;
  features: ChatFeatures;

  searchConversations: (query: string) => void;
  setChatMode: (mode: ChatMode) => void;
  setWorkMode: (mode: CloudWorkMode) => void;
  setChatStyle: (style: ChatStyle) => void;
  setToolAccess: (access: ToolAccess) => void;
  setFeature: (feature: keyof ChatFeatures, enabled: boolean) => void;
}

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

/** Build a highlighted snippet + match offsets from a piece of text. */
function buildSnippet(
  text: string,
  query: string,
): { snippet: string; matchStart: number; matchLength: number } {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) {
    return { snippet: text.slice(0, 60), matchStart: 0, matchLength: 0 };
  }
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + query.length + 30);
  const prefix = start > 0 ? '...' : '';
  return {
    snippet: prefix + text.slice(start, end) + (end < text.length ? '...' : ''),
    matchStart: idx - start + prefix.length,
    matchLength: query.length,
  };
}

/** Server search result row shape from `GET /api/search` (apps/web/app/api/search/route.ts). */
interface ServerSearchRow {
  type: 'session' | 'message';
  sessionId: string;
  messageId?: string;
  matchedText?: string;
  contextBefore?: string;
  contextAfter?: string;
}

/**
 * Run a conversation search for the current app mode and write results.
 *
 * TRUST BOUNDARY:
 *   - Local mode → in-memory search over the on-device message store ONLY. Local
 *     chats never existed on the server, so no network call is made.
 *   - Cloud mode (signed in) → the server full-text search `GET /api/search`,
 *     which covers messages synced across devices. `api.get` routes through
 *     guardedFetch, so a Local-mode call could never leak — but we don't make one.
 * Any failure falls back to the local in-memory search so search never dead-ends.
 */
async function runSearch(
  trimmed: string,
  set: (partial: Partial<ViewState>) => void,
  _get: () => ViewState,
): Promise<void> {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useChatAppModeStore } =
    require('@/src/features/chat/store/appModeStore') as typeof import('@/src/features/chat/store/appModeStore');
  const isCloud = useChatAppModeStore.getState().appMode === 'cloud';

  if (isCloud) {
    try {
      const { useAuthStore } =
        require('@/src/features/auth/store') as typeof import('@/src/features/auth/store');
      if (useAuthStore.getState().isClerkSignedIn) {
        const { api } = require('@/services/api') as typeof import('@/services/api');
        const data = await api.get<{ results: ServerSearchRow[] }>(
          `/api/search?q=${encodeURIComponent(trimmed)}&limit=50`,
        );
        const results: ConversationSearchResult[] = (data.results ?? []).map((r) => {
          const text = (r.contextBefore ?? '') + (r.matchedText ?? '') + (r.contextAfter ?? '');
          const prefix = r.contextBefore ? '...' : '';
          return {
            conversationId: r.sessionId,
            messageId: r.messageId ?? '',
            snippet: prefix + text + (r.contextAfter ? '...' : ''),
            matchStart: prefix.length + (r.contextBefore?.length ?? 0),
            matchLength: r.matchedText?.length ?? trimmed.length,
          };
        });
        set({ searchResults: results, isSearching: false });
        return;
      }
    } catch {
      // Network/auth failure → fall through to local in-memory search.
    }
  }

  // Local in-memory search over the on-device message store.
  const { useChatMessageStore } =
    require('@/stores/chat/chatMessageStore') as typeof import('@/stores/chat/chatMessageStore');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const msgState = useChatMessageStore.getState();
  const lower = trimmed.toLowerCase();
  const results: ConversationSearchResult[] = [];

  for (const [convId, msgs] of Object.entries(msgState.messages)) {
    for (const msg of msgs) {
      if ((msg.content ?? '').toLowerCase().includes(lower)) {
        const { snippet, matchStart, matchLength } = buildSnippet(msg.content ?? '', trimmed);
        results.push({
          conversationId: convId,
          messageId: msg.id,
          snippet,
          matchStart,
          matchLength,
        });
        break;
      }
    }
  }

  for (const conv of msgState.conversations) {
    const idx = conv.title.toLowerCase().indexOf(lower);
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

  set({ searchResults: results, isSearching: false });
}

export const useChatViewStore = create<ViewState>()(
  persist(
    (set, get) => ({
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      chatMode: 'chat',
      workMode: 'chat',
      chatStyle: 'normal',
      toolAccess: 'auto',
      features: { webSearch: true, imageGen: true, health: false, codeExecution: false },

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
          void runSearch(trimmed, set, get);
        }, 300);
      },

      setChatMode: (mode) => set({ chatMode: mode }),
      setWorkMode: (mode) => set({ workMode: mode }),
      setChatStyle: (style) => set({ chatStyle: style }),
      setToolAccess: (access) => set({ toolAccess: access }),
      setFeature: (feature, enabled) =>
        set((state) => ({ features: { ...state.features, [feature]: enabled } })),
    }),
    {
      name: 'chat-view-store',
      storage: createJSONStorage(() => mmkvStorage),
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      partialize: (state) => ({
        chatMode: state.chatMode,
        workMode: state.workMode,
        chatStyle: state.chatStyle,
        toolAccess: state.toolAccess,
        features: state.features,
      }),
    },
  ),
);

rehydrateWhenMmkvReady(useChatViewStore, 'chat-view-store');
