import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import type { CloudWorkMode } from '@agiworkforce/types';
import { SEARCH_INPUT_DEBOUNCE_MS } from '@agiworkforce/utils';

export type ChatMode = 'chat' | 'research' | 'create';

export type ChatStyle = 'normal' | 'concise' | 'detailed' | 'creative';

export type ToolAccess = 'auto' | 'on-demand' | 'always';

export interface ChatFeatures {
  webSearch: boolean;
  imageGen: boolean;
  health: boolean;
  codeExecution: boolean;
  research: boolean;
}

export type MediaMode = 'text' | 'image' | 'video';

/**
 * A match the server found that the device has not synced. Only kinds with a
 * working mobile destination are carried: a chat opens /(app)/chat/[id] and a
 * project opens /(app)/projects/[id]. The route's file rows name no
 * conversation, so there is nothing to open them with.
 */
export interface RemoteSearchMatch {
  id: string;
  title: string;
  subtitle: string;
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
  remoteSearchChats: RemoteSearchMatch[];
  remoteSearchProjects: RemoteSearchMatch[];
  isSearching: boolean;
  chatMode: ChatMode;
  workMode: CloudWorkMode;
  chatStyle: ChatStyle;
  toolAccess: ToolAccess;
  features: ChatFeatures;
  /** Output kind the composer is aimed at. See {@link MediaMode}. */
  mediaMode: MediaMode;
  selectedMediaModel: { image?: string; video?: string };
  videoAspectRatio: string;
  videoResolution: string;
  imageAspectRatio: string;

  searchConversations: (query: string) => void;
  setChatMode: (mode: ChatMode) => void;
  setWorkMode: (mode: CloudWorkMode) => void;
  setChatStyle: (style: ChatStyle) => void;
  setToolAccess: (access: ToolAccess) => void;
  setFeature: (feature: keyof ChatFeatures, enabled: boolean) => void;
  setMediaMode: (mode: MediaMode) => void;
  setMediaModel: (kind: 'image' | 'video', modelId: string) => void;
  setVideoAspectRatio: (aspectRatio: string) => void;
  setVideoResolution: (resolution: string) => void;
  setImageAspectRatio: (aspectRatio: string) => void;
  clearCloudSearchState: () => void;
}

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

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

interface ServerSearchRow {
  type: 'session' | 'message';
  sessionId: string;
  sessionTitle?: string;
  messageId?: string;
  matchedText?: string;
  contextBefore?: string;
  contextAfter?: string;
}

interface ServerProjectRow {
  projectId: string;
  projectName?: string;
  content?: string;
}

const EMPTY_REMOTE_MATCHES = {
  remoteSearchChats: [] as RemoteSearchMatch[],
  remoteSearchProjects: [] as RemoteSearchMatch[],
};

function remoteChatMatches(rows: ServerSearchRow[]): RemoteSearchMatch[] {
  const matches = new Map<string, RemoteSearchMatch>();
  for (const row of rows) {
    if (matches.has(row.sessionId)) continue;
    matches.set(row.sessionId, {
      id: row.sessionId,
      title: row.sessionTitle?.trim() || 'Untitled chat',
      subtitle: row.type === 'message' ? 'Matched message content' : 'Matched chat title',
    });
  }
  return [...matches.values()];
}

function remoteProjectMatches(rows: ServerProjectRow[]): RemoteSearchMatch[] {
  return rows.map((row) => ({
    id: row.projectId,
    title: row.projectName?.trim() || 'Untitled project',
    subtitle: row.content?.trim() || 'Project',
  }));
}

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
        const data = await api.get<{ results: ServerSearchRow[]; projects?: ServerProjectRow[] }>(
          `/api/search?q=${encodeURIComponent(trimmed)}&limit=50`,
        );
        const rows = data.results ?? [];
        const results: ConversationSearchResult[] = rows.map((r) => {
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
        set({
          searchResults: results,
          remoteSearchChats: remoteChatMatches(rows),
          remoteSearchProjects: remoteProjectMatches(data.projects ?? []),
          isSearching: false,
        });
        return;
      }
    } catch {
      // Network/auth failure → fall through to local in-memory search.
    }
  }

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

  set({ searchResults: results, ...EMPTY_REMOTE_MATCHES, isSearching: false });
}

export const useChatViewStore = create<ViewState>()(
  persist(
    (set, get) => ({
      searchQuery: '',
      searchResults: [],
      ...EMPTY_REMOTE_MATCHES,
      isSearching: false,
      chatMode: 'chat',
      workMode: 'chat',
      chatStyle: 'concise',
      toolAccess: 'auto',
      features: {
        webSearch: true,
        imageGen: true,
        health: false,
        codeExecution: true,
        research: false,
      },
      mediaMode: 'text',
      selectedMediaModel: {},
      videoAspectRatio: '16:9',
      videoResolution: '720p',
      imageAspectRatio: '1:1',

      searchConversations: (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) {
          if (searchDebounceTimer !== undefined) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = undefined;
          }
          set({
            searchQuery: '',
            searchResults: [],
            ...EMPTY_REMOTE_MATCHES,
            isSearching: false,
          });
          return;
        }

        set({ searchQuery: trimmed, isSearching: true });

        if (searchDebounceTimer !== undefined) {
          clearTimeout(searchDebounceTimer);
        }

        searchDebounceTimer = setTimeout(() => {
          searchDebounceTimer = undefined;
          void runSearch(trimmed, set, get);
        }, SEARCH_INPUT_DEBOUNCE_MS);
      },

      setChatMode: (mode) => set({ chatMode: mode }),
      setWorkMode: (mode) => set({ workMode: mode }),
      setChatStyle: (style) => set({ chatStyle: style }),
      setToolAccess: (access) => set({ toolAccess: access }),
      setFeature: (feature, enabled) =>
        set((state) => ({ features: { ...state.features, [feature]: enabled } })),
      setMediaMode: (mode) => set({ mediaMode: mode }),
      setMediaModel: (kind, modelId) =>
        set((state) => ({ selectedMediaModel: { ...state.selectedMediaModel, [kind]: modelId } })),
      setVideoAspectRatio: (aspectRatio) => set({ videoAspectRatio: aspectRatio }),
      setVideoResolution: (resolution) => set({ videoResolution: resolution }),
      setImageAspectRatio: (aspectRatio) => set({ imageAspectRatio: aspectRatio }),
      clearCloudSearchState: () => {
        if (searchDebounceTimer !== undefined) {
          clearTimeout(searchDebounceTimer);
          searchDebounceTimer = undefined;
        }
        set({ searchQuery: '', searchResults: [], ...EMPTY_REMOTE_MATCHES, isSearching: false });
      },
    }),
    {
      name: 'chat-view-store',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      partialize: (state) => ({
        chatMode: state.chatMode,
        workMode: state.workMode,
        chatStyle: state.chatStyle,
        toolAccess: state.toolAccess,
        features: state.features,
        selectedMediaModel: state.selectedMediaModel,
        videoAspectRatio: state.videoAspectRatio,
        videoResolution: state.videoResolution,
        imageAspectRatio: state.imageAspectRatio,
      }),
    },
  ),
);

rehydrateWhenMmkvReady(useChatViewStore, 'chat-view-store');

if (__DEV__) {
  (globalThis as unknown as { __AGI_DEBUG__?: Record<string, unknown> }).__AGI_DEBUG__ = {
    ...((globalThis as unknown as { __AGI_DEBUG__?: Record<string, unknown> }).__AGI_DEBUG__ ?? {}),
    chatViewStore: useChatViewStore,
  };
}
