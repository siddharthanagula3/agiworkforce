import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { answerPlainText } from '@/src/features/chat/utils/markdownPlainText';
import type { CloudWorkMode } from '@agiworkforce/types';
import { SEARCH_INPUT_DEBOUNCE_MS } from '@agiworkforce/utils';

export type ChatMode = 'chat' | 'research' | 'create';

export type ChatStyle = 'normal' | 'concise' | 'explanatory' | 'learning' | 'formal';

const RETIRED_CHAT_STYLES: Readonly<Record<string, ChatStyle>> = {
  detailed: 'explanatory',
  creative: 'normal',
};

export const DEFAULT_CHAT_STYLE: ChatStyle = 'normal';

export const NEW_CHAT_STYLE_KEY = 'new-chat';

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
  searchFailed: boolean;
  isSearching: boolean;
  chatMode: ChatMode;
  workMode: CloudWorkMode;
  chatStyle: ChatStyle;
  styleConversationId: string | null;
  chatStyleByConversation: Record<string, ChatStyle>;
  disabledConnectorIdsByConversation: Record<string, string[]>;
  /**
   * The composer's Run code switch, per conversation. `features.codeExecution`
   * only permits execution; this asks the server to run code on every turn.
   */
  runCodeByConversation: Record<string, true>;
  /**
   * Deep research chosen in a composer applies to that chat only, as on web.
   * `features.research` mirrors the entry of the composer on screen.
   */
  researchByConversation: Record<string, true>;
  features: ChatFeatures;
  /** Output kind the composer is aimed at. See {@link MediaMode}. */
  mediaMode: MediaMode;
  selectedMediaModel: { image?: string; video?: string };
  videoAspectRatio: string;
  videoResolution: string;
  imageAspectRatio: string;
  imageTransparentBackground: boolean;
  videoDurationSecs: number | null;

  searchConversations: (query: string) => void;
  setChatMode: (mode: ChatMode) => void;
  setWorkMode: (mode: CloudWorkMode) => void;
  setChatStyle: (style: ChatStyle) => void;
  bindStyleConversation: (conversationId: string) => void;
  adoptStyleSelection: (fromKey: string, toKey: string) => void;
  toggleChatConnector: (key: string, connectorId: string) => void;
  setRunCode: (key: string, enabled: boolean) => void;
  setFeature: (feature: keyof ChatFeatures, enabled: boolean) => void;
  setMediaMode: (mode: MediaMode) => void;
  setMediaModel: (kind: 'image' | 'video', modelId: string) => void;
  setVideoAspectRatio: (aspectRatio: string) => void;
  setVideoResolution: (resolution: string) => void;
  setImageAspectRatio: (aspectRatio: string) => void;
  resetMediaChoice: (kind: 'image' | 'video') => void;
  setImageTransparentBackground: (enabled: boolean) => void;
  setVideoDurationSecs: (durationSecs: number) => void;
  clearCloudSearchState: () => void;
  clearCloudConversationState: (conversationIds: readonly string[]) => void;
}

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let searchGeneration = 0;

function searchableText(markdown: string): string {
  return answerPlainText(markdown).replace(/\s+/g, ' ').trim();
}

const messageTextCache = new WeakMap<object, { content: string; text: string }>();

function messageSearchText(message: { content?: string | null }): string {
  const content = message.content ?? '';
  const cached = messageTextCache.get(message);
  if (cached && cached.content === content) return cached.text;
  const text = searchableText(content);
  messageTextCache.set(message, { content, text });
  return text;
}

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

function nearestIndexOf(text: string, needle: string, anchor: number): number {
  const haystack = text.toLowerCase();
  const target = needle.toLowerCase();
  let best = -1;
  let from = haystack.indexOf(target);
  while (from !== -1) {
    if (best === -1 || Math.abs(from - anchor) < Math.abs(best - anchor)) best = from;
    from = haystack.indexOf(target, from + 1);
  }
  return best;
}

function buildServerSnippet(
  row: ServerSearchRow,
  query: string,
): { snippet: string; matchStart: number; matchLength: number } {
  const before = row.contextBefore ?? '';
  const matched = row.matchedText ?? '';
  const after = row.contextAfter ?? '';
  const text = searchableText(before + matched + after);
  const needle = searchableText(matched) || query;
  const idx = nearestIndexOf(text, needle, searchableText(before).length);
  const prefix = searchableText(before) ? '...' : '';
  return {
    snippet: prefix + text + (searchableText(after) ? '...' : ''),
    matchStart: idx === -1 ? 0 : prefix.length + idx,
    matchLength: idx === -1 ? 0 : needle.length,
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
  searchFailed: false,
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
    subtitle: searchableText(row.content ?? '') || 'Project',
  }));
}

async function runSearch(
  trimmed: string,
  generation: number,
  set: (partial: Partial<ViewState>) => void,
  get: () => ViewState,
): Promise<void> {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useChatAppModeStore } =
    require('@/src/features/chat/store/appModeStore') as typeof import('@/src/features/chat/store/appModeStore');
  const { useAuthStore } =
    require('@/src/features/auth/store') as typeof import('@/src/features/auth/store');
  const isCloud = useChatAppModeStore.getState().appMode === 'cloud';
  const account = isCloud ? captureCloudAccountEpoch() : null;
  const isCurrent = () =>
    generation === searchGeneration &&
    get().searchQuery === trimmed &&
    (useChatAppModeStore.getState().appMode === 'cloud') === isCloud &&
    (!isCloud || (isCloudAccountEpochCurrent(account) && useAuthStore.getState().isClerkSignedIn));

  if (isCloud && (!account || !useAuthStore.getState().isClerkSignedIn)) {
    if (generation === searchGeneration && get().searchQuery === trimmed) {
      set({ searchResults: [], ...EMPTY_REMOTE_MATCHES, isSearching: false });
    }
    return;
  }

  let cloudSearchFailed = false;
  if (isCloud) {
    try {
      if (useAuthStore.getState().isClerkSignedIn) {
        const { api } = require('@/services/api') as typeof import('@/services/api');
        const data = await api.get<{ results: ServerSearchRow[]; projects?: ServerProjectRow[] }>(
          `/api/search?q=${encodeURIComponent(trimmed)}&limit=50`,
        );
        if (!isCurrent() || !useAuthStore.getState().isClerkSignedIn) return;
        const rows = data.results ?? [];
        const results: ConversationSearchResult[] = rows.map((r) => ({
          conversationId: r.sessionId,
          messageId: r.messageId ?? '',
          ...buildServerSnippet(r, trimmed),
        }));
        set({
          searchResults: results,
          remoteSearchChats: remoteChatMatches(rows),
          remoteSearchProjects: remoteProjectMatches(data.projects ?? []),
          isSearching: false,
        });
        return;
      }
    } catch {
      if (!isCurrent()) return;
      cloudSearchFailed = true;
    }
  }

  if (!isCurrent()) return;
  const { useChatMessageStore } =
    require('@/stores/chat/chatMessageStore') as typeof import('@/stores/chat/chatMessageStore');
  const { useChatCloudMessageStore } =
    require('@/stores/chat/chatCloudMessageStore') as typeof import('@/stores/chat/chatCloudMessageStore');
  const { isHistoryVisibleConversation } =
    require('@/src/features/chat/utils/conversationMode') as typeof import('@/src/features/chat/utils/conversationMode');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const msgState = isCloud ? useChatCloudMessageStore.getState() : useChatMessageStore.getState();
  const lower = trimmed.toLowerCase();
  const results: ConversationSearchResult[] = [];
  const hidden = new Set(
    msgState.conversations
      .filter((conv) => !isHistoryVisibleConversation(conv))
      .map((conv) => conv.id),
  );

  for (const [convId, msgs] of Object.entries(msgState.messages)) {
    if (hidden.has(convId)) continue;
    for (const msg of msgs) {
      const text = messageSearchText(msg);
      if (text.toLowerCase().includes(lower)) {
        const { snippet, matchStart, matchLength } = buildSnippet(text, trimmed);
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
    if (hidden.has(conv.id)) continue;
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

  if (isCurrent()) {
    set({
      searchResults: results,
      ...EMPTY_REMOTE_MATCHES,
      searchFailed: cloudSearchFailed,
      isSearching: false,
    });
  }
}

export function styleForConversation(
  state: Pick<ViewState, 'chatStyle' | 'styleConversationId' | 'chatStyleByConversation'>,
  conversationId: string,
): ChatStyle {
  if (state.styleConversationId === conversationId) return state.chatStyle;
  return state.chatStyleByConversation[conversationId] ?? DEFAULT_CHAT_STYLE;
}

export function migratePersistedChatView(
  persisted: unknown,
  version: number,
): Record<string, unknown> {
  const next = { ...((persisted ?? {}) as Record<string, unknown>) };
  delete next.toolAccess;
  if (version < 2 && typeof next.chatStyle === 'string') {
    next.chatStyle =
      next.chatStyle === 'concise'
        ? 'normal'
        : (RETIRED_CHAT_STYLES[next.chatStyle] ?? next.chatStyle);
  }
  return next;
}

/** Whether a turn sent in this conversation asks for deep research. */
export function isResearchChosenFor(
  state: Pick<ViewState, 'researchByConversation' | 'styleConversationId' | 'features'>,
  conversationId: string,
): boolean {
  if (state.researchByConversation?.[conversationId] === true) return true;
  return (
    (state.styleConversationId === null || state.styleConversationId === conversationId) &&
    state.features.research
  );
}

const DEFAULT_IMAGE_CHOICE = {
  imageAspectRatio: '1:1',
  imageTransparentBackground: false,
} as const;

const DEFAULT_VIDEO_CHOICE = {
  videoAspectRatio: '16:9',
  videoResolution: '720p',
  videoDurationSecs: null,
} as const;

export const useChatViewStore = create<ViewState>()(
  persist(
    (set, get) => ({
      searchQuery: '',
      searchResults: [],
      ...EMPTY_REMOTE_MATCHES,
      isSearching: false,
      chatMode: 'chat',
      workMode: 'chat',
      chatStyle: DEFAULT_CHAT_STYLE,
      styleConversationId: null,
      chatStyleByConversation: {},
      disabledConnectorIdsByConversation: {},
      runCodeByConversation: {},
      researchByConversation: {},
      features: {
        webSearch: true,
        imageGen: true,
        health: false,
        codeExecution: true,
        research: false,
      },
      mediaMode: 'text',
      selectedMediaModel: {},
      ...DEFAULT_VIDEO_CHOICE,
      ...DEFAULT_IMAGE_CHOICE,

      searchConversations: (query: string) => {
        searchGeneration += 1;
        const generation = searchGeneration;
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

        set({
          searchQuery: trimmed,
          searchResults: [],
          ...EMPTY_REMOTE_MATCHES,
          isSearching: true,
        });

        if (searchDebounceTimer !== undefined) {
          clearTimeout(searchDebounceTimer);
        }

        searchDebounceTimer = setTimeout(() => {
          searchDebounceTimer = undefined;
          void runSearch(trimmed, generation, set, get);
        }, SEARCH_INPUT_DEBOUNCE_MS);
      },

      setChatMode: (mode) => set({ chatMode: mode }),
      setWorkMode: (mode) => set({ workMode: mode }),
      setChatStyle: (style) =>
        set((state) => {
          const key = state.styleConversationId;
          if (!key) return { chatStyle: style };
          const { [key]: _previous, ...rest } = state.chatStyleByConversation;
          return {
            chatStyle: style,
            chatStyleByConversation:
              style === DEFAULT_CHAT_STYLE ? rest : { ...rest, [key]: style },
          };
        }),
      bindStyleConversation: (conversationId) =>
        set((state) =>
          state.styleConversationId === conversationId
            ? state
            : {
                styleConversationId: conversationId,
                chatStyle: state.chatStyleByConversation[conversationId] ?? DEFAULT_CHAT_STYLE,
                features: {
                  ...state.features,
                  research: state.researchByConversation[conversationId] === true,
                },
              },
        ),
      adoptStyleSelection: (fromKey, toKey) =>
        set((state) => {
          if (fromKey === toKey) return state;
          const pending = state.chatStyleByConversation[fromKey];
          const pendingSources = state.disabledConnectorIdsByConversation[fromKey];
          const pendingRunCode = state.runCodeByConversation[fromKey];
          const pendingResearch = state.researchByConversation[fromKey];
          if (!pending && !pendingSources && !pendingRunCode && !pendingResearch) return state;
          const { [fromKey]: _pendingResearch, ...restResearch } = state.researchByConversation;
          const { [fromKey]: _pending, ...rest } = state.chatStyleByConversation;
          const { [fromKey]: _pendingSources, ...restSources } =
            state.disabledConnectorIdsByConversation;
          const { [fromKey]: _pendingRunCode, ...restRunCode } = state.runCodeByConversation;
          return {
            chatStyleByConversation: pending
              ? { ...rest, [toKey]: rest[toKey] ?? pending }
              : state.chatStyleByConversation,
            disabledConnectorIdsByConversation: pendingSources
              ? { ...restSources, [toKey]: restSources[toKey] ?? pendingSources }
              : state.disabledConnectorIdsByConversation,
            runCodeByConversation: pendingRunCode
              ? { ...restRunCode, [toKey]: pendingRunCode }
              : state.runCodeByConversation,
            researchByConversation: pendingResearch
              ? { ...restResearch, [toKey]: pendingResearch }
              : state.researchByConversation,
            ...(state.styleConversationId === fromKey ? { styleConversationId: toKey } : {}),
          };
        }),
      toggleChatConnector: (key, connectorId) =>
        set((state) => {
          const current = state.disabledConnectorIdsByConversation[key] ?? [];
          const next = current.includes(connectorId)
            ? current.filter((id) => id !== connectorId)
            : [...current, connectorId];
          const { [key]: _previous, ...rest } = state.disabledConnectorIdsByConversation;
          return {
            disabledConnectorIdsByConversation: next.length > 0 ? { ...rest, [key]: next } : rest,
          };
        }),
      setRunCode: (key, enabled) =>
        set((state) => {
          const { [key]: _previous, ...rest } = state.runCodeByConversation;
          return { runCodeByConversation: enabled ? { ...rest, [key]: true } : rest };
        }),
      setFeature: (feature, enabled) =>
        set((state) => {
          const features = { ...state.features, [feature]: enabled };
          const key = state.styleConversationId;
          if (feature !== 'research' || !key) return { features };
          const { [key]: _previous, ...rest } = state.researchByConversation;
          return { features, researchByConversation: enabled ? { ...rest, [key]: true } : rest };
        }),
      setMediaMode: (mode) => set({ mediaMode: mode }),
      setMediaModel: (kind, modelId) =>
        set((state) => ({ selectedMediaModel: { ...state.selectedMediaModel, [kind]: modelId } })),
      setVideoAspectRatio: (aspectRatio) => set({ videoAspectRatio: aspectRatio }),
      setVideoResolution: (resolution) => set({ videoResolution: resolution }),
      setImageAspectRatio: (aspectRatio) => set({ imageAspectRatio: aspectRatio }),
      resetMediaChoice: (kind) =>
        set({
          mediaMode: 'text',
          ...(kind === 'image' ? DEFAULT_IMAGE_CHOICE : DEFAULT_VIDEO_CHOICE),
        }),
      setImageTransparentBackground: (enabled) => set({ imageTransparentBackground: enabled }),
      setVideoDurationSecs: (durationSecs) => set({ videoDurationSecs: durationSecs }),
      clearCloudSearchState: () => {
        searchGeneration += 1;
        if (searchDebounceTimer !== undefined) {
          clearTimeout(searchDebounceTimer);
          searchDebounceTimer = undefined;
        }
        set({ searchQuery: '', searchResults: [], ...EMPTY_REMOTE_MATCHES, isSearching: false });
      },
      clearCloudConversationState: (conversationIds) => {
        const cloudIds = new Set(conversationIds);
        const withoutCloud = <T>(byConversation: Record<string, T>): Record<string, T> =>
          Object.fromEntries(Object.entries(byConversation).filter(([id]) => !cloudIds.has(id)));
        set((state) => ({
          chatStyleByConversation: withoutCloud(state.chatStyleByConversation),
          disabledConnectorIdsByConversation: withoutCloud(
            state.disabledConnectorIdsByConversation,
          ),
          runCodeByConversation: withoutCloud(state.runCodeByConversation),
          ...(state.styleConversationId !== null && cloudIds.has(state.styleConversationId)
            ? { styleConversationId: null, chatStyle: DEFAULT_CHAT_STYLE }
            : {}),
        }));
      },
    }),
    {
      name: 'chat-view-store',
      storage: createJSONStorage(() => mmkvStorage),
      version: 2,
      migrate: migratePersistedChatView,
      skipHydration: true,
      partialize: (state) => ({
        chatMode: state.chatMode,
        workMode: state.workMode,
        chatStyle: state.chatStyle,
        chatStyleByConversation: state.chatStyleByConversation,
        disabledConnectorIdsByConversation: state.disabledConnectorIdsByConversation,
        features: { ...state.features, research: false },
        selectedMediaModel: state.selectedMediaModel,
        videoAspectRatio: state.videoAspectRatio,
        videoResolution: state.videoResolution,
        imageAspectRatio: state.imageAspectRatio,
        imageTransparentBackground: state.imageTransparentBackground,
        videoDurationSecs: state.videoDurationSecs,
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
