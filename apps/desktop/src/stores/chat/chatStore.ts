import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { toast } from 'sonner';
import { invoke } from '../../lib/tauri-mock';
import { createByokFork } from '../../api/byok';
import { getModelContextWindow } from '../../constants/llm';
import { safeGetJSON, safeSetJSON, storageFallback } from '../../utils/localStorage';
import { useAppModeStore } from '../appModeStore';
import { CHAT_EXECUTION_MODES, type ChatExecutionMode } from '@agiworkforce/types';
import { AUTOSAVE_DEBOUNCE_MS } from '@agiworkforce/utils';
import { selectHasCloudAccountSession, useUnifiedAuthStore } from '../auth';
import { useModelStore } from '../modelStore';
import { registerChatStoreStateReader } from './chatStoreRef';
import {
  getCloudConversations,
  deleteCloudConversation,
  ensureCloudConversation,
  updateCloudConversation,
  updateCloudConversationTitle,
  getCloudMessages,
} from '../../services/cloudChat';
import type {
  EnhancedMessage,
  ConversationSummary,
  PendingUserMessage,
  Citation,
  TokenUsage,
  FocusMode,
  ActiveView,
  ConversationMode,
  InlinePanel,
  InlinePanelContent,
  MessageReaction,
} from './types';
import { useChatViewStore, initializeChatViewModelSubscription } from './chatViewStore';
import { useChatExecutionStore, registerExecutionMessagePatcher } from './chatExecutionStore';

export type {
  EnhancedMessage,
  ConversationSummary,
  PendingUserMessage,
  Citation,
  TokenUsage,
  FocusMode,
  ActiveView,
  ConversationMode,
  MessageMetadata,
  Attachment,
  Operation,
  MessageReaction,
  InlinePanel,
  InlinePanelContent,
  SlashCommandMetadata,
} from './types';

function isCloudMode(): boolean {
  return useAppModeStore.getState().mode === 'cloud';
}

let conversationLoadGeneration = 0;
let messageLoadGeneration = 0;

function isCurrentCloudAccount(userId: string): boolean {
  const auth = useUnifiedAuthStore.getState();
  return isCloudMode() && selectHasCloudAccountSession(auth) && auth.user?.id === userId;
}

export const LOCAL_DESKTOP_USER_ID = 'local-desktop-user';

export function resolveDesktopChatOwnerId(): string {
  return useUnifiedAuthStore.getState().user?.id ?? LOCAL_DESKTOP_USER_ID;
}

export function defaultConversationExecutionMode(): ChatExecutionMode {
  return isCloudMode() ? 'cloud_managed' : 'local_only';
}

const ON_DEVICE_EXECUTION_MODES = CHAT_EXECUTION_MODES.filter((mode) => mode !== 'cloud_managed');

export interface BackendConversation {
  id: number;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  execution_mode?: ChatExecutionMode;
  project_id?: string | null;
  archived?: boolean;
  pinned?: boolean;
}

export const LOCAL_CONVERSATION_PAGE_SIZE = 200;

function convertBackendConversation(conv: BackendConversation): ConversationSummary {
  const uuid = dbIdToUuid(conv.id);
  return {
    id: uuid,
    title: conv.title,
    pinned: conv.pinned ?? false,
    archived: conv.archived ?? false,
    ...(conv.project_id ? { projectId: conv.project_id } : {}),
    lastMessage: '',
    updatedAt: new Date(conv.updated_at),
    createdAt: new Date(conv.created_at),
    executionMode: conv.execution_mode ?? defaultConversationExecutionMode(),
  };
}

/** A temporary chat ends when the user leaves it: nothing of it is kept, here or on disk. */
function discardTemporaryConversations(
  state: Pick<ChatMessageState, 'conversations' | 'messagesByConversation'>,
  keepId: string | null,
) {
  for (const conversation of state.conversations) {
    if (conversation.incognito && conversation.id !== keepId) {
      delete state.messagesByConversation[conversation.id];
    }
  }
  state.conversations = state.conversations.filter(
    (conversation) => !conversation.incognito || conversation.id === keepId,
  );
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
}

interface BackendMessage {
  id: number;
  conversation_id: number;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens: number | null;
  cost: number | null;
  provider: string | null;
  model: string | null;
  created_at: string;
}

function convertBackendMessage(msg: BackendMessage): EnhancedMessage {
  return {
    id: msg.id.toString(),
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.created_at),
    metadata: {
      model: msg.model ?? undefined,
      provider: msg.provider ?? undefined,
      cost: msg.cost ?? undefined,
      tokenCount: msg.tokens ?? undefined,
    },
  };
}

interface IdMapping {
  dbIdToUuid: Record<number, string>;
  uuidToDbId: Record<string, number>;
}

let idMappings: IdMapping = { dbIdToUuid: {}, uuidToDbId: {} };

if (typeof window !== 'undefined') {
  idMappings = safeGetJSON<IdMapping>(STORAGE_KEYS.ID_MAPPINGS, { dbIdToUuid: {}, uuidToDbId: {} });
}

let _persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistIdMappings() {
  if (typeof window === 'undefined') return;
  if (_persistTimer !== null) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    const success = safeSetJSON(STORAGE_KEYS.ID_MAPPINGS, idMappings);
    if (!success) {
      console.warn('[ChatStore] Failed to persist ID mappings - using in-memory only');
    }
  }, AUTOSAVE_DEBOUNCE_MS);
}

export function dbIdToUuid(dbId: number): string {
  if (!idMappings.dbIdToUuid[dbId]) {
    const uuid = crypto.randomUUID();
    idMappings.dbIdToUuid[dbId] = uuid;
    idMappings.uuidToDbId[uuid] = dbId;
    persistIdMappings();
  }
  return idMappings.dbIdToUuid[dbId]!;
}

export function uuidToDbId(uuid: string): number | undefined {
  return idMappings.uuidToDbId[uuid];
}

function forgetConversationId(uuid: string) {
  const dbId = idMappings.uuidToDbId[uuid];
  if (dbId === undefined) return;
  delete idMappings.uuidToDbId[uuid];
  delete idMappings.dbIdToUuid[dbId];
  persistIdMappings();
}

export function clearIdMappings() {
  idMappings = { dbIdToUuid: {}, uuidToDbId: {} };
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEYS.ID_MAPPINGS);
    } catch {
      /* ignore */
    }
  }
}

function generateTitleFromMessage(content: string): string {
  const cleaned = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/[#*_~[\](){}|\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'New conversation';
  const maxLength = 50;
  if (cleaned.length <= maxLength) return cleaned;
  const truncated = cleaned.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 30) return truncated.slice(0, lastSpace) + '...';
  return truncated + '...';
}

const STORAGE_VERSION = 2;

import type { ToolLabelEntry } from '@agiworkforce/types';
import { STORAGE_KEYS } from '../../constants/storageKeys';
export type { ToolLabelEntry };

export interface ApprovedByokContextItem {
  messageId: string;
  redactedContent: string;
}

export interface ByokForkOptions {
  approvedContext: readonly ApprovedByokContextItem[];
  title?: string;
  model?: string;
  provider?: string;
}

export interface ChatMessageState {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  messagesByConversation: Record<string, EnhancedMessage[]>;
  messages: EnhancedMessage[];

  ensureActiveConversation: () => void;
  createConversation: (title?: string, options?: { incognito?: boolean }) => string;
  forkConversationForByok: (
    sourceConversationId: string,
    options: ByokForkOptions,
  ) => string | null;
  createByokConversation: (title?: string) => string;
  persistByokFork: (forkId: string) => Promise<void>;
  selectConversation: (id: string) => void;
  loadConversations: (userId: string) => Promise<void>;
  openSavedConversation: (conversation: BackendConversation) => string;
  loadConversationMessages: (id: string, userId: string) => Promise<void>;
  setConversationMessages: (id: string, messages: EnhancedMessage[]) => void;
  renameConversation: (id: string, title: string) => Promise<boolean>;
  deleteConversation: (id: string) => Promise<boolean>;
  togglePinnedConversation: (id: string) => void;
  archiveConversation: (id: string) => void;
  restoreConversation: (id: string) => void;
  getArchivedConversations: () => ConversationSummary[];
  getConversationsByProject: (projectId: string) => ConversationSummary[];
  setConversationProject: (conversationId: string, projectId: string | null) => void;
  setConversationModel: (conversationId: string, model: string | null) => void;

  addMessage: (message: Omit<EnhancedMessage, 'id' | 'timestamp'> & { id?: string }) => string;
  addOptimisticMessage: (message: Omit<EnhancedMessage, 'id' | 'timestamp'>) => string;
  confirmOptimisticMessage: (tempId: string, confirmedId?: string) => void;
  failOptimisticMessage: (tempId: string, error: string) => void;
  retryFailedMessage: (id: string) => void;
  updateMessage: (id: string, updates: Partial<EnhancedMessage>) => void;
  deleteMessage: (id: string) => void;
  editMessage: (messageId: string, newContent: string) => void;
  getMessagesAfter: (messageId: string) => EnhancedMessage[];
  toggleMessageBookmark: (messageId: string) => void;
  toggleMessageReaction: (messageId: string, reaction: MessageReaction) => void;
  getBookmarkedMessages: () => EnhancedMessage[];
  getConversationStats: (id?: string) => {
    messageCount: number;
    userMessages: number;
    assistantMessages: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };

  getRecentConversations: (limit?: number) => Promise<RecentConversationSearchResult[]>;

  clearHistory: () => void;
  linkConversationId: (uuid: string, dbId: number) => void;
  resetOnLogout: () => void;
}

export interface RecentConversationSearchResult {
  conversationId: string | number;
  title: string;
  messageCount: number;
  lastUpdated: string;
  snippet?: string;
}

export const useChatMessageStore = create<ChatMessageState>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get) => ({
          conversations: [],
          activeConversationId: null,
          messagesByConversation: {},
          messages: [],

          ensureActiveConversation: () =>
            set(
              (state) => {
                const activeConversation = state.activeConversationId
                  ? state.conversations.find(
                      (conversation) => conversation.id === state.activeConversationId,
                    )
                  : undefined;
                if (activeConversation) {
                  const existing = state.messagesByConversation[activeConversation.id];
                  if (existing && state.messages.length === 0) state.messages = existing.slice();
                  return;
                }

                const id = state.activeConversationId ?? crypto.randomUUID();
                const existingMessages = state.messagesByConversation[id] ?? [];
                const created: ConversationSummary = {
                  id,
                  title: 'New chat',
                  pinned: false,
                  lastMessage: '',
                  updatedAt: new Date(),
                  executionMode: defaultConversationExecutionMode(),
                };
                state.conversations.unshift(created);
                state.activeConversationId = id;
                state.messagesByConversation[id] = existingMessages;
                state.messages = existingMessages.slice();
              },
              undefined,
              'chat/ensureActiveConversation',
            ),

          createConversation: (title = 'New chat', options) => {
            const id = crypto.randomUUID();
            set(
              (state) => {
                discardTemporaryConversations(state, null);
                const convo: ConversationSummary = {
                  id,
                  title,
                  pinned: false,
                  lastMessage: '',
                  updatedAt: new Date(),
                  executionMode: defaultConversationExecutionMode(),
                  ...(options?.incognito ? { incognito: true } : {}),
                };
                state.conversations.unshift(convo);

                if (isCloudMode()) {
                  ensureCloudConversation(id, title).catch((error) => {
                    console.error('[ChatStore] Failed to create cloud conversation:', error);
                    set(
                      (s) => {
                        const hasUserData = (s.messagesByConversation[id]?.length ?? 0) > 0;
                        if (hasUserData) return;
                        s.conversations = s.conversations.filter((c) => c.id !== id);
                        delete s.messagesByConversation[id];
                        if (s.activeConversationId === id) {
                          const next = s.conversations[0];
                          s.activeConversationId = next ? next.id : null;
                          s.messages = next ? (s.messagesByConversation[next.id] ?? []) : [];
                        }
                      },
                      undefined,
                      'chat/createConversation/cloud/rollback',
                    );
                  });
                }

                state.activeConversationId = id;
                state.messagesByConversation[id] = [];
                state.messages = [];
                useChatExecutionStore.setState({
                  isStreaming: false,
                  currentStreamingMessageId: null,
                });
              },
              undefined,
              'chat/createConversation',
            );
            return id;
          },

          forkConversationForByok: (sourceConversationId, options) => {
            const sourceState = get();
            const sourceConversation = sourceState.conversations.find(
              (conversation) => conversation.id === sourceConversationId,
            );
            const sourceMessages = sourceState.messagesByConversation[sourceConversationId] ?? [];
            const approvedContentById = new Map(
              options.approvedContext.map((item) => [item.messageId, item.redactedContent]),
            );
            const forkId = crypto.randomUUID();
            const forkedAt = new Date();
            const forkedMessages = sourceMessages.flatMap((message, index): EnhancedMessage[] => {
              const approvedContent = approvedContentById.get(message.id);
              if (approvedContent === undefined) return [];
              const {
                streaming: _streaming,
                pending: _pending,
                error: _error,
                ...safeMessage
              } = message;

              return [
                {
                  ...safeMessage,
                  id: `${message.id}-byok-fork-${forkedAt.getTime()}-${index}`,
                  content: approvedContent,
                  timestamp: new Date(message.timestamp),
                  metadata: {
                    ...message.metadata,
                    ...(options.model ? { model: options.model } : {}),
                    ...(options.provider ? { provider: options.provider } : {}),
                  },
                },
              ];
            });
            if (forkedMessages.length === 0) return null;
            const title =
              options.title ?? `${sourceConversation?.title ?? 'Conversation'} (BYOK fork)`;
            const lastMessage =
              forkedMessages.at(-1)?.content ?? sourceConversation?.lastMessage ?? '';

            set(
              (state) => {
                const forkConversation: ConversationSummary = {
                  id: forkId,
                  title,
                  pinned: false,
                  lastMessage,
                  updatedAt: forkedAt,
                  projectId: sourceConversation?.projectId,
                  modelOverride: options.model ?? sourceConversation?.modelOverride,
                  executionMode: 'byok',
                };

                state.conversations.unshift(forkConversation);
                state.messagesByConversation[forkId] = forkedMessages;
                state.activeConversationId = forkId;
                state.messages = forkedMessages.slice();
              },
              undefined,
              'chat/forkConversationForByok',
            );

            useChatExecutionStore.setState({
              isStreaming: false,
              currentStreamingMessageId: null,
            });

            return forkId;
          },

          createByokConversation: (title = 'New BYOK chat') => {
            if (isCloudMode()) {
              throw new Error(
                'BYOK chats run in Local mode. Switch to Local mode to use your key.',
              );
            }
            const id = crypto.randomUUID();
            set(
              (state) => {
                state.conversations.unshift({
                  id,
                  title,
                  pinned: false,
                  lastMessage: '',
                  updatedAt: new Date(),
                  executionMode: 'byok',
                });
                state.activeConversationId = id;
                state.messagesByConversation[id] = [];
                state.messages = [];
              },
              undefined,
              'chat/createByokConversation',
            );
            useChatExecutionStore.setState({
              isStreaming: false,
              currentStreamingMessageId: null,
            });
            return id;
          },

          persistByokFork: async (forkId) => {
            const state = get();
            const fork = state.conversations.find((conversation) => conversation.id === forkId);
            if (!fork || fork.executionMode !== 'byok') {
              throw new Error('Only a BYOK fork can be saved as a BYOK conversation.');
            }
            const messages = (state.messagesByConversation[forkId] ?? []).flatMap((message) =>
              message.role === 'user' || message.role === 'assistant'
                ? [{ role: message.role, content: message.content }]
                : [],
            );
            try {
              const dbId = await createByokFork({
                userId: resolveDesktopChatOwnerId(),
                title: fork.title,
                projectId: fork.projectId ?? null,
                messages,
              });
              get().linkConversationId(forkId, dbId);
            } catch (error) {
              set(
                (draft) => {
                  draft.conversations = draft.conversations.filter((c) => c.id !== forkId);
                  delete draft.messagesByConversation[forkId];
                  if (draft.activeConversationId === forkId) {
                    draft.activeConversationId = null;
                    draft.messages = [];
                  }
                },
                undefined,
                'chat/persistByokFork/rollback',
              );
              throw error;
            }
          },

          selectConversation: (id: string) =>
            set(
              (state) => {
                if (state.activeConversationId === id) return;
                discardTemporaryConversations(state, id);
                state.activeConversationId = id;
                const cachedMessages = state.messagesByConversation[id];
                if (cachedMessages && cachedMessages.length > 0) {
                  state.messages = cachedMessages.slice();
                  useChatExecutionStore.setState({ isLoadingMessages: false });
                } else {
                  state.messages = [];
                  useChatExecutionStore.setState({ isLoadingMessages: true });
                }
                useChatExecutionStore.setState({
                  isStreaming: false,
                  currentStreamingMessageId: null,
                });
              },
              undefined,
              'chat/selectConversation',
            ),

          loadConversations: async (userId: string) => {
            const generation = ++conversationLoadGeneration;
            if (!userId) {
              console.warn('[ChatStore] loadConversations called without userId');
              return;
            }
            if (isCloudMode()) {
              try {
                const cloudConversations = await getCloudConversations();
                if (generation !== conversationLoadGeneration || !isCurrentCloudAccount(userId)) {
                  return;
                }
                const converted: ConversationSummary[] = cloudConversations.map((c) => ({
                  id: c.id,
                  title: c.title ?? 'Untitled',
                  pinned: c.pinned,
                  archived: c.archived,
                  projectId: c.project_id ?? undefined,
                  modelOverride: c.model ?? undefined,
                  lastMessage: '',
                  updatedAt: new Date(c.updated_at),
                  createdAt: new Date(c.created_at),
                  messageCount: c.message_count ?? 0,
                  executionMode: 'cloud_managed',
                }));
                set(
                  (state) => {
                    state.conversations = converted;
                    if (!state.activeConversationId && converted.length > 0)
                      state.activeConversationId = converted[0]!.id;
                  },
                  undefined,
                  'chat/loadConversations/cloud/success',
                );
              } catch (error) {
                console.error('[ChatStore] Failed to load cloud conversations:', error);
                throw error instanceof Error
                  ? error
                  : new Error('Could not load your Managed Cloud conversations.');
              }
              return;
            }
            let loaded: ConversationSummary[] = [];
            for (;;) {
              let page: BackendConversation[];
              try {
                page = await invoke<BackendConversation[]>('chat_get_conversations', {
                  userId,
                  appMode: 'local',
                  limit: LOCAL_CONVERSATION_PAGE_SIZE,
                  offset: loaded.length,
                });
              } catch (error) {
                console.error('[ChatStore] Failed to load conversations:', error);
                throw new Error(
                  `Could not load your Local conversations. ${errorText(error, '')}`.trim(),
                );
              }
              if (generation !== conversationLoadGeneration || isCloudMode()) return;
              loaded = [...loaded, ...page.map(convertBackendConversation)];
              const complete = page.length < LOCAL_CONVERSATION_PAGE_SIZE;
              const snapshot = loaded;
              set(
                (state) => {
                  const loadedIds = new Set(snapshot.map((conversation) => conversation.id));
                  // Until the last page arrives, a stored chat missing from the list may sit
                  // on a later page. After it, only chats never saved to SQLite remain.
                  const localOnly = state.conversations.filter(
                    (conversation) =>
                      !loadedIds.has(conversation.id) &&
                      (!complete || uuidToDbId(conversation.id) === undefined),
                  );
                  state.conversations = [...snapshot, ...localOnly];
                  if (!state.activeConversationId && snapshot.length > 0)
                    state.activeConversationId = snapshot[0]!.id;
                },
                undefined,
                'chat/loadConversations/page',
              );
              if (complete) return;
            }
          },

          openSavedConversation: (backend) => {
            const conversation = convertBackendConversation(backend);
            set(
              (state) => {
                discardTemporaryConversations(state, conversation.id);
                state.conversations = [
                  conversation,
                  ...state.conversations.filter((c) => c.id !== conversation.id),
                ];
                state.activeConversationId = conversation.id;
                state.messages = state.messagesByConversation[conversation.id] ?? [];
              },
              undefined,
              'chat/openSavedConversation',
            );
            return conversation.id;
          },

          loadConversationMessages: async (id: string, userId: string) => {
            const generation = ++messageLoadGeneration;
            if (isCloudMode()) {
              useChatExecutionStore.setState({ isLoadingMessages: true });
              try {
                const cloudMessages = await getCloudMessages(id);
                if (generation !== messageLoadGeneration) {
                  return;
                }
                if (!isCurrentCloudAccount(userId)) {
                  useChatExecutionStore.setState({ isLoadingMessages: false });
                  return;
                }
                const enhancedMessages: EnhancedMessage[] = cloudMessages.map((m) => ({
                  id: m.id,
                  role: m.role as 'user' | 'assistant' | 'system',
                  content: m.content,
                  timestamp: new Date(m.created_at),
                  metadata: {
                    model: m.model ?? undefined,
                    provider: m.provider ?? undefined,
                    tokenCount: m.token_count ?? undefined,
                    cost: m.cost ?? undefined,
                    ...(m.metadata ?? {}),
                  },
                }));
                set(
                  (s) => {
                    s.messagesByConversation[id] = enhancedMessages;
                    if (s.activeConversationId === id) s.messages = enhancedMessages;
                  },
                  undefined,
                  'chat/loadConversationMessages/cloud/success',
                );
                useChatExecutionStore.setState({ isLoadingMessages: false });
              } catch (error) {
                console.error('[ChatStore] Failed to load cloud messages:', error);
                useChatExecutionStore.setState({ isLoadingMessages: false });
                throw error instanceof Error
                  ? error
                  : new Error('Could not load this Managed Cloud conversation.');
              }
              return;
            }
            const dbId = uuidToDbId(id);
            if (!dbId) {
              console.warn('[ChatStore] No database ID found for conversation:', id);
              useChatExecutionStore.setState({ isLoadingMessages: false });
              return;
            }
            useChatExecutionStore.setState({ isLoadingMessages: true });
            try {
              const backendMessages = await invoke<BackendMessage[]>('chat_get_messages', {
                conversationId: dbId,
                userId,
              });
              if (generation !== messageLoadGeneration) return;
              if (isCloudMode()) {
                useChatExecutionStore.setState({ isLoadingMessages: false });
                return;
              }
              const enhancedMessages = backendMessages.map(convertBackendMessage);
              set(
                (s) => {
                  s.messagesByConversation[id] = enhancedMessages;
                  if (s.activeConversationId === id) s.messages = enhancedMessages;
                },
                undefined,
                'chat/loadConversationMessages/success',
              );
              useChatExecutionStore.setState({ isLoadingMessages: false });
            } catch (error) {
              console.error('[ChatStore] Failed to load messages:', error);
              useChatExecutionStore.setState({ isLoadingMessages: false });
            }
          },

          setConversationMessages: (id: string, messages: EnhancedMessage[]) =>
            set(
              (state) => {
                state.messagesByConversation[id] = messages;
                if (state.activeConversationId === id) state.messages = messages.slice();
                useChatExecutionStore.setState({ isLoadingMessages: false });
              },
              undefined,
              'chat/setConversationMessages',
            ),

          renameConversation: async (id: string, title: string) => {
            const trimmed = title.trim();
            const previousTitle = get().conversations.find(
              (conversation) => conversation.id === id,
            )?.title;
            if (!trimmed || previousTitle === undefined) return false;
            set(
              (state) => {
                const convo = state.conversations.find((c) => c.id === id);
                if (convo) {
                  convo.title = trimmed;
                  convo.updatedAt = new Date();
                }
              },
              undefined,
              'chat/renameConversation',
            );
            const rollback = (error: unknown, fallback: string) => {
              console.error('[ChatStore] Failed to rename conversation:', error);
              set(
                (state) => {
                  const conversation = state.conversations.find((candidate) => candidate.id === id);
                  if (conversation?.title === trimmed) conversation.title = previousTitle;
                },
                undefined,
                'chat/renameConversation/rollback',
              );
              toast.error(errorText(error, fallback));
              return false;
            };
            if (isCloudMode()) {
              try {
                await updateCloudConversationTitle(id, trimmed);
                return true;
              } catch (error) {
                return rollback(error, 'Could not rename this Cloud chat.');
              }
            }
            const dbId = uuidToDbId(id);
            if (dbId === undefined) return true;
            try {
              await invoke('chat_update_conversation_title', {
                conversationId: dbId,
                userId: resolveDesktopChatOwnerId(),
                title: trimmed,
              });
              return true;
            } catch (error) {
              return rollback(error, 'Could not rename this chat. The old title was kept.');
            }
          },

          deleteConversation: async (id: string) => {
            const removeFromState = () => {
              set(
                (state) => {
                  const msgs = state.messagesByConversation[id];
                  if (msgs) {
                    for (const msg of msgs) {
                      const timeline = useChatExecutionStore.getState().toolTimelineByMessage;
                      if (timeline[msg.id]) {
                        const next = { ...timeline };
                        delete next[msg.id];
                        useChatExecutionStore.setState({ toolTimelineByMessage: next });
                      }
                      const thinking = useChatExecutionStore.getState().thinkingByMessage;
                      if (thinking[msg.id]) {
                        const next = { ...thinking };
                        delete next[msg.id];
                        useChatExecutionStore.setState({ thinkingByMessage: next });
                      }
                    }
                  }
                  state.conversations = state.conversations.filter((c) => c.id !== id);
                  delete state.messagesByConversation[id];
                  if (state.activeConversationId === id) {
                    const next = state.conversations[0];
                    state.activeConversationId = next ? next.id : null;
                    state.messages = next ? (state.messagesByConversation[next.id] ?? []) : [];
                  }
                },
                undefined,
                'chat/deleteConversation',
              );
            };
            try {
              if (isCloudMode()) {
                await deleteCloudConversation(id);
              } else {
                const dbId = uuidToDbId(id);
                if (dbId !== undefined) {
                  await invoke('chat_delete_conversation', {
                    id: dbId,
                    userId: resolveDesktopChatOwnerId(),
                  });
                  forgetConversationId(id);
                }
              }
            } catch (error) {
              console.error('[ChatStore] Failed to delete conversation:', error);
              toast.error(
                errorText(error, 'Could not delete this chat. It is still in your history.'),
              );
              return false;
            }
            removeFromState();
            return true;
          },

          togglePinnedConversation: (id: string) => {
            let pinned: boolean | undefined;
            let previousPinned: boolean | undefined;
            set(
              (state) => {
                const convo = state.conversations.find((c) => c.id === id);
                if (convo) {
                  previousPinned = convo.pinned;
                  convo.pinned = !convo.pinned;
                  pinned = convo.pinned;
                  convo.updatedAt = new Date();
                }
              },
              undefined,
              'chat/togglePinnedConversation',
            );
            if (pinned === undefined) return;
            const nextPinned = pinned;
            const persistPin = isCloudMode()
              ? () => updateCloudConversation(id, { pinned: nextPinned })
              : uuidToDbId(id) !== undefined
                ? () =>
                    invoke('chat_pin_conversation', {
                      conversationId: uuidToDbId(id),
                      userId: resolveDesktopChatOwnerId(),
                      pinned: nextPinned,
                    })
                : null;
            if (persistPin) {
              void persistPin().catch((error: unknown) => {
                console.error('[ChatStore] Failed to pin conversation:', error);
                set(
                  (state) => {
                    const conversation = state.conversations.find(
                      (candidate) => candidate.id === id,
                    );
                    if (
                      conversation &&
                      conversation.pinned === pinned &&
                      previousPinned !== undefined
                    ) {
                      conversation.pinned = previousPinned;
                    }
                  },
                  undefined,
                  'chat/togglePinnedConversation/rollback',
                );
                toast.error(errorText(error, 'Could not pin this chat.'));
              });
            }
          },

          archiveConversation: (id: string) => {
            const previous = get().conversations.find((conversation) => conversation.id === id);
            const previousArchived = previous?.archived;
            const previousPinned = previous?.pinned;
            set(
              (state) => {
                const convo = state.conversations.find((c) => c.id === id);
                if (convo) {
                  convo.archived = true;
                  convo.pinned = false;
                  convo.updatedAt = new Date();
                  if (state.activeConversationId === id) {
                    const next = state.conversations.find((c) => c.id !== id && !c.archived);
                    state.activeConversationId = next ? next.id : null;
                    state.messages = next ? (state.messagesByConversation[next.id] ?? []) : [];
                  }
                }
              },
              undefined,
              'chat/archiveConversation',
            );
            if (isCloudMode()) {
              void updateCloudConversation(id, { archived: true, pinned: false }).catch((error) => {
                console.error('[ChatStore] Failed to archive cloud conversation:', error);
                set(
                  (state) => {
                    const conversation = state.conversations.find(
                      (candidate) => candidate.id === id,
                    );
                    if (conversation?.archived === true) {
                      conversation.archived = previousArchived;
                      conversation.pinned = previousPinned ?? false;
                    }
                  },
                  undefined,
                  'chat/archiveConversation/cloud/rollback',
                );
                toast.error(
                  error instanceof Error ? error.message : 'Could not archive this Cloud chat.',
                );
              });
              return;
            }
            const dbId = uuidToDbId(id);
            if (dbId === undefined) return;
            void invoke('chat_archive_conversation', {
              conversationId: dbId,
              userId: resolveDesktopChatOwnerId(),
              archived: true,
            }).catch((error: unknown) => {
              console.error('[ChatStore] Failed to archive conversation:', error);
              set(
                (state) => {
                  const conversation = state.conversations.find((candidate) => candidate.id === id);
                  if (conversation?.archived === true) {
                    conversation.archived = previousArchived;
                    conversation.pinned = previousPinned ?? false;
                  }
                },
                undefined,
                'chat/archiveConversation/rollback',
              );
              toast.error(errorText(error, 'Could not archive this chat.'));
            });
          },

          restoreConversation: (id: string) => {
            const previousArchived = get().conversations.find(
              (conversation) => conversation.id === id,
            )?.archived;
            set(
              (state) => {
                const convo = state.conversations.find((c) => c.id === id);
                if (convo) {
                  convo.archived = false;
                  convo.updatedAt = new Date();
                }
              },
              undefined,
              'chat/restoreConversation',
            );
            if (isCloudMode()) {
              void updateCloudConversation(id, { archived: false }).catch((error) => {
                console.error('[ChatStore] Failed to restore cloud conversation:', error);
                set(
                  (state) => {
                    const conversation = state.conversations.find(
                      (candidate) => candidate.id === id,
                    );
                    if (conversation?.archived === false) {
                      conversation.archived = previousArchived;
                    }
                  },
                  undefined,
                  'chat/restoreConversation/cloud/rollback',
                );
                toast.error(
                  error instanceof Error ? error.message : 'Could not restore this Cloud chat.',
                );
              });
              return;
            }
            const dbId = uuidToDbId(id);
            if (dbId === undefined) return;
            void invoke('chat_archive_conversation', {
              conversationId: dbId,
              userId: resolveDesktopChatOwnerId(),
              archived: false,
            }).catch((error: unknown) => {
              console.error('[ChatStore] Failed to restore conversation:', error);
              set(
                (state) => {
                  const conversation = state.conversations.find((candidate) => candidate.id === id);
                  if (conversation?.archived === false) conversation.archived = previousArchived;
                },
                undefined,
                'chat/restoreConversation/rollback',
              );
              toast.error(errorText(error, 'Could not restore this chat.'));
            });
          },

          getArchivedConversations: () => get().conversations.filter((c) => c.archived === true),

          getConversationsByProject: (projectId: string) =>
            get().conversations.filter((c) => c.projectId === projectId),

          setConversationProject: (conversationId: string, projectId: string | null) => {
            const previousProjectId = get().conversations.find(
              (conversation) => conversation.id === conversationId,
            )?.projectId;
            set(
              (state) => {
                const convo = state.conversations.find((c) => c.id === conversationId);
                if (convo) {
                  convo.projectId = projectId || undefined;
                  convo.updatedAt = new Date();
                }
              },
              undefined,
              'chat/setConversationProject',
            );
            const dbId = uuidToDbId(conversationId);
            if (isCloudMode() || dbId === undefined) return;
            void invoke('chat_set_conversation_project', {
              conversationId: dbId,
              userId: resolveDesktopChatOwnerId(),
              projectId: projectId || null,
            }).catch((error: unknown) => {
              console.error('[ChatStore] Failed to move conversation to project:', error);
              set(
                (state) => {
                  const conversation = state.conversations.find(
                    (candidate) => candidate.id === conversationId,
                  );
                  if (conversation && conversation.projectId === (projectId || undefined)) {
                    conversation.projectId = previousProjectId;
                  }
                },
                undefined,
                'chat/setConversationProject/rollback',
              );
              toast.error(errorText(error, 'Could not move this chat to the project.'));
            });
          },

          setConversationModel: (conversationId: string, model: string | null) => {
            const previousModel = get().conversations.find(
              (conversation) => conversation.id === conversationId,
            )?.modelOverride;
            set(
              (state) => {
                const convo = state.conversations.find((c) => c.id === conversationId);
                if (convo) {
                  convo.modelOverride = model || undefined;
                  convo.updatedAt = new Date();
                }
              },
              undefined,
              'chat/setConversationModel',
            );
            if (isCloudMode() && model) {
              void updateCloudConversation(conversationId, { model }).catch((error) => {
                console.error('[ChatStore] Failed to update cloud conversation model:', error);
                set(
                  (state) => {
                    const conversation = state.conversations.find(
                      (candidate) => candidate.id === conversationId,
                    );
                    if (conversation?.modelOverride === model) {
                      conversation.modelOverride = previousModel;
                    }
                  },
                  undefined,
                  'chat/setConversationModel/cloud/rollback',
                );
                toast.error(
                  error instanceof Error ? error.message : 'Could not update the Cloud model.',
                );
              });
            }
          },

          addMessage: (message) => {
            const assignedId = message.id ?? crypto.randomUUID();
            const stateBeforeInsert = get();
            const activeConversationBeforeInsert = stateBeforeInsert.conversations.find(
              (conversation) => conversation.id === stateBeforeInsert.activeConversationId,
            );
            const shouldPersistGeneratedCloudTitle =
              isCloudMode() &&
              message.role === 'user' &&
              Boolean(message.content) &&
              (!stateBeforeInsert.activeConversationId ||
                activeConversationBeforeInsert?.title === 'New chat');
            set(
              (state) => {
                if (!state.activeConversationId) {
                  const id = crypto.randomUUID();
                  const convo: ConversationSummary = {
                    id,
                    title: 'New chat',
                    pinned: false,
                    lastMessage: '',
                    updatedAt: new Date(),
                    executionMode: defaultConversationExecutionMode(),
                  };
                  state.conversations.unshift(convo);
                  state.activeConversationId = id;
                  state.messagesByConversation[id] = [];
                }
                const convoId = state.activeConversationId as string;
                const newMessage: EnhancedMessage = {
                  ...message,
                  id: assignedId,
                  timestamp: new Date(),
                };
                state.messages.push(newMessage);
                if (!state.messagesByConversation[convoId])
                  state.messagesByConversation[convoId] = [];
                state.messagesByConversation[convoId]!.push(newMessage);
                if (state.messagesByConversation[convoId]!.length > 1000) {
                  state.messagesByConversation[convoId] =
                    state.messagesByConversation[convoId]!.slice(-1000);
                  state.messages = state.messagesByConversation[convoId]!.slice();
                } else if (state.messages.length > 1000) {
                  state.messages = state.messages.slice(-1000);
                  state.messagesByConversation[convoId] = state.messages.slice();
                }
                const convo = state.conversations.find((c) => c.id === convoId);
                if (convo) {
                  convo.lastMessage = newMessage.content;
                  convo.updatedAt = newMessage.timestamp;
                  if (
                    convo.title === 'New chat' &&
                    newMessage.role === 'user' &&
                    newMessage.content
                  ) {
                    convo.title = generateTitleFromMessage(newMessage.content);
                  }
                }
              },
              undefined,
              'chat/addMessage',
            );
            if (shouldPersistGeneratedCloudTitle) {
              const updatedState = get();
              const generatedCloudConversation = updatedState.conversations.find(
                (conversation) => conversation.id === updatedState.activeConversationId,
              );
              if (generatedCloudConversation && generatedCloudConversation.title !== 'New chat') {
                void updateCloudConversationTitle(
                  generatedCloudConversation.id,
                  generatedCloudConversation.title,
                ).catch((error) => {
                  console.error('[ChatStore] Failed to persist generated cloud title:', error);
                });
              }
            }
            return assignedId;
          },

          addOptimisticMessage: (message) => {
            const tempId = crypto.randomUUID();
            set(
              (state) => {
                if (!state.activeConversationId) {
                  const id = crypto.randomUUID();
                  const convo: ConversationSummary = {
                    id,
                    title: 'New chat',
                    pinned: false,
                    lastMessage: '',
                    updatedAt: new Date(),
                    executionMode: defaultConversationExecutionMode(),
                  };
                  state.conversations.unshift(convo);
                  state.activeConversationId = id;
                  state.messagesByConversation[id] = [];
                }
                const convoId = state.activeConversationId as string;
                const optimisticMessage: EnhancedMessage = {
                  ...message,
                  id: tempId,
                  timestamp: new Date(),
                  pending: true,
                };
                state.messages.push(optimisticMessage);
                if (!state.messagesByConversation[convoId])
                  state.messagesByConversation[convoId] = [];
                state.messagesByConversation[convoId]!.push(optimisticMessage);
                const convo = state.conversations.find((c) => c.id === convoId);
                if (convo) {
                  convo.lastMessage = optimisticMessage.content;
                  convo.updatedAt = optimisticMessage.timestamp;
                }
              },
              undefined,
              'chat/addOptimisticMessage',
            );
            return tempId;
          },

          confirmOptimisticMessage: (tempId, confirmedId) =>
            set(
              (state) => {
                const convoId = state.activeConversationId;
                const applyConfirmation = (list: EnhancedMessage[]) => {
                  const idx = list.findIndex((m) => m.id === tempId);
                  if (idx !== -1 && list[idx]) {
                    delete list[idx]!.pending;
                    delete list[idx]!.error;
                    if (confirmedId) list[idx]!.id = confirmedId;
                  }
                };
                applyConfirmation(state.messages);
                if (convoId && state.messagesByConversation[convoId])
                  applyConfirmation(state.messagesByConversation[convoId]!);
              },
              undefined,
              'chat/confirmOptimisticMessage',
            ),

          failOptimisticMessage: (tempId, error) =>
            set(
              (state) => {
                const applyFailure = (list: EnhancedMessage[]) => {
                  const idx = list.findIndex((m) => m.id === tempId);
                  if (idx !== -1 && list[idx]) {
                    delete list[idx]!.pending;
                    list[idx]!.error = error;
                  }
                };
                applyFailure(state.messages);
                const convoId = state.activeConversationId;
                if (convoId && state.messagesByConversation[convoId])
                  applyFailure(state.messagesByConversation[convoId]!);
              },
              undefined,
              'chat/failOptimisticMessage',
            ),

          retryFailedMessage: (id) =>
            set(
              (state) => {
                const applyRetry = (list: EnhancedMessage[]) => {
                  const idx = list.findIndex((m) => m.id === id);
                  if (idx !== -1 && list[idx]) {
                    delete list[idx]!.error;
                    list[idx]!.pending = true;
                  }
                };
                applyRetry(state.messages);
                const convoId = state.activeConversationId;
                if (convoId && state.messagesByConversation[convoId])
                  applyRetry(state.messagesByConversation[convoId]!);
              },
              undefined,
              'chat/retryFailedMessage',
            ),

          updateMessage: (id, updates) =>
            set(
              (state) => {
                const applyUpdate = (list: EnhancedMessage[]) => {
                  const idx = list.findIndex((m) => m.id === id);
                  if (idx !== -1 && list[idx]) {
                    const message = list[idx]!;
                    const mergedUpdates =
                      updates.metadata && message.metadata
                        ? { ...updates, metadata: { ...message.metadata, ...updates.metadata } }
                        : updates;
                    Object.assign(message, mergedUpdates);
                    return true;
                  }
                  return false;
                };
                const updatedInMessages = applyUpdate(state.messages);
                const activeConversationId = state.activeConversationId;
                let updatedInConversation = false;
                if (activeConversationId && state.messagesByConversation[activeConversationId])
                  updatedInConversation = applyUpdate(
                    state.messagesByConversation[activeConversationId]!,
                  );
                if (!updatedInConversation) {
                  for (const [convId, messages] of Object.entries(state.messagesByConversation)) {
                    if (!messages || convId === activeConversationId) continue;
                    if (applyUpdate(messages)) {
                      updatedInConversation = true;
                      break;
                    }
                  }
                }
                if (!updatedInMessages && activeConversationId && updatedInConversation) {
                  const activeMessages = state.messagesByConversation[activeConversationId];
                  const activeIdx = activeMessages?.findIndex((m) => m.id === id) ?? -1;
                  const stateIdx = state.messages.findIndex((m) => m.id === id);
                  if (activeIdx !== -1 && stateIdx !== -1 && activeMessages)
                    state.messages[stateIdx] = activeMessages[activeIdx]!;
                }
              },
              undefined,
              'chat/updateMessage',
            ),

          deleteMessage: (id) =>
            set(
              (state) => {
                state.messages = state.messages.filter((m) => m.id !== id);
                const convoId = state.activeConversationId;
                if (convoId && state.messagesByConversation[convoId])
                  state.messagesByConversation[convoId] = state.messagesByConversation[
                    convoId
                  ]!.filter((m) => m.id !== id);
              },
              undefined,
              'chat/deleteMessage',
            ),

          editMessage: (messageId, newContent) =>
            set(
              (state) => {
                const applyEdit = (messages: EnhancedMessage[]) => {
                  const msg = messages.find((m) => m.id === messageId);
                  if (msg && msg.role === 'user') {
                    if (!msg.metadata?.originalContent)
                      msg.metadata = { ...msg.metadata, originalContent: msg.content };
                    msg.content = newContent;
                    msg.metadata = { ...msg.metadata, edited: true, editedAt: new Date() };
                  }
                };
                applyEdit(state.messages);
                const convoId = state.activeConversationId;
                if (convoId && state.messagesByConversation[convoId])
                  applyEdit(state.messagesByConversation[convoId]!);
              },
              undefined,
              'chat/editMessage',
            ),

          getMessagesAfter: (messageId) => {
            const state = get();
            const messageIndex = state.messages.findIndex((m) => m.id === messageId);
            if (messageIndex === -1) return [];
            return state.messages.slice(messageIndex + 1);
          },

          toggleMessageBookmark: (messageId) =>
            set(
              (state) => {
                const messageInMessages = state.messages.find((m) => m.id === messageId);
                const newValue = messageInMessages ? !messageInMessages.bookmarked : undefined;
                if (messageInMessages && newValue !== undefined)
                  messageInMessages.bookmarked = newValue;
                for (const convoId of Object.keys(state.messagesByConversation)) {
                  const messages = state.messagesByConversation[convoId];
                  if (messages) {
                    const message = messages.find((m) => m.id === messageId);
                    if (message) {
                      message.bookmarked = newValue ?? !message.bookmarked;
                      break;
                    }
                  }
                }
              },
              undefined,
              'chat/toggleMessageBookmark',
            ),

          toggleMessageReaction: (messageId, reaction) =>
            set(
              (state) => {
                const messageInMessages = state.messages.find((m) => m.id === messageId);
                const shouldAdd = messageInMessages
                  ? !(messageInMessages.reactions ?? []).includes(reaction)
                  : true;
                const applyReaction = (message: EnhancedMessage | undefined) => {
                  if (!message) return;
                  if (!message.reactions) message.reactions = [];
                  if (shouldAdd) {
                    if (!message.reactions.includes(reaction)) message.reactions.push(reaction);
                  } else {
                    const index = message.reactions.indexOf(reaction);
                    if (index >= 0) message.reactions.splice(index, 1);
                  }
                };
                applyReaction(messageInMessages);
                for (const convoId of Object.keys(state.messagesByConversation)) {
                  const messages = state.messagesByConversation[convoId];
                  if (messages) {
                    const message = messages.find((m) => m.id === messageId);
                    if (message) {
                      applyReaction(message);
                      break;
                    }
                  }
                }
              },
              undefined,
              'chat/toggleMessageReaction',
            ),

          getBookmarkedMessages: () => {
            const state = get();
            const bookmarked: EnhancedMessage[] = [];
            for (const convoId of Object.keys(state.messagesByConversation)) {
              const messages = state.messagesByConversation[convoId];
              if (messages) bookmarked.push(...messages.filter((m) => m.bookmarked));
            }
            return bookmarked.sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
            );
          },

          getConversationStats: (id?: string) => {
            const state = get();
            const targetId = id || state.activeConversationId;
            const messages = targetId ? state.messagesByConversation[targetId] || [] : [];
            let userMessages = 0,
              assistantMessages = 0,
              inputTokens = 0,
              outputTokens = 0,
              totalCost = 0;
            for (const msg of messages) {
              if (msg.role === 'user') userMessages++;
              if (msg.role === 'assistant') assistantMessages++;
              if (msg.metadata) {
                inputTokens += msg.metadata.inputTokens || 0;
                outputTokens += msg.metadata.outputTokens || 0;
                totalCost += msg.metadata.cost || 0;
              }
            }
            return {
              messageCount: messages.length,
              userMessages,
              assistantMessages,
              totalTokens: inputTokens + outputTokens,
              inputTokens,
              outputTokens,
              totalCost,
            };
          },

          getRecentConversations: async (limit?: number) => {
            if (isCloudMode()) {
              const maxResults = Math.max(0, limit ?? 10);
              const state = get();
              return state.conversations
                .filter((conversation) => !conversation.archived)
                .slice()
                .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
                .slice(0, maxResults)
                .map((conversation) => ({
                  conversationId: conversation.id,
                  title: conversation.title,
                  messageCount: state.messagesByConversation[conversation.id]?.length ?? 0,
                  lastUpdated: conversation.updatedAt.toISOString(),
                  ...(conversation.lastMessage ? { snippet: conversation.lastMessage } : {}),
                }));
            }

            try {
              return await invoke<RecentConversationSearchResult[]>('get_recent_conversations', {
                limit: limit ?? null,
                userId: resolveDesktopChatOwnerId(),
                executionModes: ON_DEVICE_EXECUTION_MODES,
              });
            } catch (error) {
              console.error('[ChatStore] Failed to get recent conversations:', error);
              return [];
            }
          },

          clearHistory: () => {
            set(
              (state) => {
                const newId = crypto.randomUUID();
                const convo: ConversationSummary = {
                  id: newId,
                  title: 'New chat',
                  pinned: false,
                  lastMessage: '',
                  updatedAt: new Date(),
                  executionMode: defaultConversationExecutionMode(),
                };
                state.conversations.unshift(convo);
                state.activeConversationId = newId;
                state.messages = [];
                state.messagesByConversation[newId] = [];
              },
              undefined,
              'chat/clearHistory',
            );
            useChatExecutionStore.setState({
              isStreaming: false,
              currentStreamingMessageId: null,
              toolTimelineByMessage: {},
              thinkingByMessage: {},
              agenticLoopStatus: null,
            });
            useChatViewStore.getState().clearCitations();
            useChatViewStore.setState({ focusMode: null });
          },

          linkConversationId: (uuid, dbId) => {
            if (!idMappings.uuidToDbId[uuid]) {
              idMappings.uuidToDbId[uuid] = dbId;
              idMappings.dbIdToUuid[dbId] = uuid;
              persistIdMappings();
            }
          },

          resetOnLogout: () => {
            useChatExecutionStore.getState().stopStreamWatchdog();
            set(
              (state) => {
                state.conversations = [];
                state.activeConversationId = null;
                state.messagesByConversation = {};
                state.messages = [];
              },
              undefined,
              'chat/resetOnLogout',
            );
            useChatExecutionStore.setState({
              isLoading: false,
              isLoadingMessages: false,
              isStreaming: false,
              currentStreamingMessageId: null,
              pendingMessages: [],
              toolTimelineByMessage: {},
              thinkingByMessage: {},
              agenticLoopStatus: null,
              lastStreamActivityAt: null,
              streamWatchdogTimerId: null,
            });
            useChatViewStore.getState().resetViewState();
            if (_persistTimer !== null) {
              clearTimeout(_persistTimer);
              _persistTimer = null;
            }
            clearIdMappings();
          },
        })),
      ),
      {
        name: 'chat-storage',
        version: STORAGE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        // Messages are not stored here: SQLite owns Local history and Managed Cloud
        // owns its own. Temporary chats are never written to disk at all.
        partialize: (state) => {
          const kept = state.conversations.filter((conversation) => !conversation.incognito);
          const activeIsKept = kept.some(
            (conversation) => conversation.id === state.activeConversationId,
          );
          return {
            conversations: kept,
            activeConversationId: activeIsKept ? state.activeConversationId : null,
          };
        },
        migrate: (persistedState: unknown, version: number) => {
          const state = (persistedState ?? {}) as Partial<ChatMessageState>;
          if (version < 2) delete state.messagesByConversation;
          return state as ChatMessageState;
        },
      },
    ),
    { name: 'ChatMessageStore', enabled: import.meta.env.DEV },
  ),
);

registerExecutionMessagePatcher((fn) => {
  const { messages, messagesByConversation, activeConversationId } = useChatMessageStore.getState();
  fn(messages, activeConversationId ? messagesByConversation[activeConversationId] : undefined);
});

registerChatStoreStateReader(useChatExecutionStore);

export interface ChatState extends ChatMessageState {
  focusMode: FocusMode;
  activeView: ActiveView;
  conversationMode: ConversationMode;
  draftContent: string;
  editingMessageId: string | null;
  showMessageTimestamps: boolean;
  selectedMessage: string | null;
  citations: Citation[];
  tokenUsage: TokenUsage;

  setFocusMode: (mode: FocusMode) => void;
  setActiveView: (view: ActiveView) => void;
  setConversationMode: (mode: ConversationMode) => void;
  setDraftContent: (value: string) => void;
  startEditingMessage: (id: string, content: string) => void;
  cancelEditing: () => void;
  setSelectedMessage: (id: string | null) => void;
  toggleMessageTimestamps: () => void;
  addCitation: (citation: Omit<Citation, 'id' | 'timestamp'>) => void;
  getCitationByIndex: (index: number) => Citation | undefined;
  clearCitations: () => void;
  updateTokenUsage: (usage: Partial<TokenUsage>) => void;
  getTokenPercentage: () => number;

  isLoading: boolean;
  isLoadingMessages: boolean;
  isStreaming: boolean;
  currentStreamingMessageId: string | null;
  pendingMessages: PendingUserMessage[];
  toolTimelineByMessage: Record<string, ToolLabelEntry[]>;
  thinkingByMessage: Record<string, string>;
  agenticLoopStatus: {
    active: boolean;
    conversationId: number | null;
    iteration: number;
    maxIterations: number;
  } | null;
  lastStreamActivityAt: number | null;
  streamWatchdogTimerId: ReturnType<typeof setTimeout> | null;

  setIsLoading: (loading: boolean) => void;
  setLoadingMessages: (loading: boolean) => void;
  setStreamingMessage: (id: string | null) => void;
  appendToStreamingMessage: (content: string) => void;
  addInlinePanel: (messageId: string, panel: InlinePanel) => void;
  updateInlinePanel: (
    messageId: string,
    panelId: string,
    content: Partial<InlinePanelContent>,
  ) => void;
  toggleInlinePanelCollapse: (messageId: string, panelId: string) => void;
  addPendingMessage: (message: PendingUserMessage) => void;
  removePendingMessage: (id: string) => void;
  clearPendingMessages: () => void;
  getPendingMessagesCount: () => number;
  addToolTimelineEntry: (messageId: string, entry: ToolLabelEntry) => void;
  updateToolTimelineEntry: (
    messageId: string,
    entryId: string,
    updates: Partial<ToolLabelEntry>,
  ) => void;
  appendThinkingContent: (messageId: string, delta: string) => void;
  clearThinkingContent: (messageId: string) => void;
  setAgenticLoopStatus: (status: ChatState['agenticLoopStatus']) => void;
  markStreamActivity: () => void;
  startStreamWatchdog: () => void;
  stopStreamWatchdog: () => void;
  handleStreamInactivityTimeout: () => void;
}

function buildCombinedState(
  msg: ReturnType<typeof useChatMessageStore.getState>,
  exec: ReturnType<typeof useChatExecutionStore.getState>,
  view: ReturnType<typeof useChatViewStore.getState>,
): ChatState {
  return {
    ...msg,
    isLoading: exec.isLoading,
    isLoadingMessages: exec.isLoadingMessages,
    isStreaming: exec.isStreaming,
    currentStreamingMessageId: exec.currentStreamingMessageId,
    pendingMessages: exec.pendingMessages,
    toolTimelineByMessage: exec.toolTimelineByMessage,
    thinkingByMessage: exec.thinkingByMessage,
    agenticLoopStatus: exec.agenticLoopStatus,
    lastStreamActivityAt: exec.lastStreamActivityAt,
    streamWatchdogTimerId: exec.streamWatchdogTimerId,
    setIsLoading: exec.setIsLoading,
    setLoadingMessages: exec.setLoadingMessages,
    setStreamingMessage: exec.setStreamingMessage,
    appendToStreamingMessage: exec.appendToStreamingMessage,
    addInlinePanel: exec.addInlinePanel,
    updateInlinePanel: exec.updateInlinePanel,
    toggleInlinePanelCollapse: exec.toggleInlinePanelCollapse,
    addPendingMessage: exec.addPendingMessage,
    removePendingMessage: exec.removePendingMessage,
    clearPendingMessages: exec.clearPendingMessages,
    getPendingMessagesCount: exec.getPendingMessagesCount,
    addToolTimelineEntry: exec.addToolTimelineEntry,
    updateToolTimelineEntry: exec.updateToolTimelineEntry,
    appendThinkingContent: exec.appendThinkingContent,
    clearThinkingContent: exec.clearThinkingContent,
    setAgenticLoopStatus: exec.setAgenticLoopStatus,
    markStreamActivity: exec.markStreamActivity,
    startStreamWatchdog: exec.startStreamWatchdog,
    stopStreamWatchdog: exec.stopStreamWatchdog,
    handleStreamInactivityTimeout: exec.handleStreamInactivityTimeout,
    focusMode: view.focusMode,
    activeView: view.activeView,
    conversationMode: view.conversationMode,
    draftContent: view.draftContent,
    editingMessageId: view.editingMessageId,
    showMessageTimestamps: view.showMessageTimestamps,
    selectedMessage: view.selectedMessage,
    citations: view.citations,
    tokenUsage: view.tokenUsage,
    setFocusMode: view.setFocusMode,
    setActiveView: view.setActiveView,
    setConversationMode: view.setConversationMode,
    setDraftContent: view.setDraftContent,
    startEditingMessage: view.startEditingMessage,
    cancelEditing: view.cancelEditing,
    setSelectedMessage: view.setSelectedMessage,
    toggleMessageTimestamps: view.toggleMessageTimestamps,
    addCitation: view.addCitation,
    getCitationByIndex: view.getCitationByIndex,
    clearCitations: view.clearCitations,
    updateTokenUsage: view.updateTokenUsage,
    getTokenPercentage: view.getTokenPercentage,
  };
}

type SettableChatState = Partial<
  Pick<
    ChatState,
    | 'conversations'
    | 'messages'
    | 'activeConversationId'
    | 'messagesByConversation'
    | 'focusMode'
    | 'activeView'
    | 'conversationMode'
    | 'showMessageTimestamps'
    | 'draftContent'
    | 'editingMessageId'
    | 'selectedMessage'
    | 'isLoading'
    | 'isLoadingMessages'
    | 'isStreaming'
    | 'currentStreamingMessageId'
    | 'pendingMessages'
    | 'citations'
    | 'tokenUsage'
    | 'toolTimelineByMessage'
    | 'thinkingByMessage'
    | 'agenticLoopStatus'
    | 'lastStreamActivityAt'
    | 'streamWatchdogTimerId'
  >
>;

export function useChatStore<T = ChatState>(selector?: (state: ChatState) => T): T {
  const msgSlice = useChatMessageStore();
  const execSlice = useChatExecutionStore();
  const viewSlice = useChatViewStore();
  const combined = buildCombinedState(msgSlice, execSlice, viewSlice);
  return (selector ? selector(combined) : combined) as T;
}

useChatStore.getState = (): ChatState =>
  buildCombinedState(
    useChatMessageStore.getState(),
    useChatExecutionStore.getState(),
    useChatViewStore.getState(),
  );

useChatStore.setState = (
  updater: SettableChatState | ((state: ChatState) => SettableChatState),
): void => {
  const partial = typeof updater === 'function' ? updater(useChatStore.getState()) : updater;

  const {
    focusMode,
    activeView,
    conversationMode,
    showMessageTimestamps,
    citations,
    tokenUsage,
    draftContent,
    editingMessageId,
    selectedMessage,
    isLoading,
    isLoadingMessages,
    isStreaming,
    currentStreamingMessageId,
    pendingMessages,
    toolTimelineByMessage,
    thinkingByMessage,
    agenticLoopStatus,
    lastStreamActivityAt,
    streamWatchdogTimerId,
    ...msgFields
  } = partial;

  if (Object.keys(msgFields).length > 0) useChatMessageStore.setState(msgFields);

  const viewUpdate: Partial<ReturnType<typeof useChatViewStore.getState>> = {};
  if (focusMode !== undefined) viewUpdate.focusMode = focusMode;
  if (activeView !== undefined) viewUpdate.activeView = activeView;
  if (conversationMode !== undefined) viewUpdate.conversationMode = conversationMode;
  if (showMessageTimestamps !== undefined) viewUpdate.showMessageTimestamps = showMessageTimestamps;
  if (citations !== undefined) viewUpdate.citations = citations;
  if (tokenUsage !== undefined) viewUpdate.tokenUsage = tokenUsage;
  if (draftContent !== undefined) viewUpdate.draftContent = draftContent;
  if (editingMessageId !== undefined) viewUpdate.editingMessageId = editingMessageId;
  if (selectedMessage !== undefined) viewUpdate.selectedMessage = selectedMessage;
  if (Object.keys(viewUpdate).length > 0) useChatViewStore.setState(viewUpdate);

  const execUpdate: Partial<ReturnType<typeof useChatExecutionStore.getState>> = {};
  if (isLoading !== undefined) execUpdate.isLoading = isLoading;
  if (isLoadingMessages !== undefined) execUpdate.isLoadingMessages = isLoadingMessages;
  if (isStreaming !== undefined) execUpdate.isStreaming = isStreaming;
  if (currentStreamingMessageId !== undefined)
    execUpdate.currentStreamingMessageId = currentStreamingMessageId;
  if (pendingMessages !== undefined) execUpdate.pendingMessages = pendingMessages;
  if (toolTimelineByMessage !== undefined) execUpdate.toolTimelineByMessage = toolTimelineByMessage;
  if (thinkingByMessage !== undefined) execUpdate.thinkingByMessage = thinkingByMessage;
  if (agenticLoopStatus !== undefined) execUpdate.agenticLoopStatus = agenticLoopStatus;
  if (lastStreamActivityAt !== undefined) execUpdate.lastStreamActivityAt = lastStreamActivityAt;
  if (streamWatchdogTimerId !== undefined) execUpdate.streamWatchdogTimerId = streamWatchdogTimerId;
  if (Object.keys(execUpdate).length > 0) useChatExecutionStore.setState(execUpdate);
};

useChatStore.subscribe = useChatMessageStore.subscribe as typeof useChatMessageStore.subscribe;

export const selectConversations = (state: ChatState) => state.conversations;
export const selectActiveConversationId = (state: ChatState) => state.activeConversationId;
export const selectMessages = (state: ChatState) => state.messages;
export const selectIsLoading = (state: ChatState) => state.isLoading;
export const selectIsLoadingMessages = (state: ChatState) => state.isLoadingMessages;
export const selectIsStreaming = (state: ChatState) => state.isStreaming;
export const selectCurrentStreamingMessageId = (state: ChatState) =>
  state.currentStreamingMessageId;
export const selectPendingMessages = (state: ChatState) => state.pendingMessages;
export const selectCitations = (state: ChatState) => state.citations;
export const selectTokenUsage = (state: ChatState) => state.tokenUsage;
export const selectFocusMode = (state: ChatState) => state.focusMode;
export const selectActiveView = (state: ChatState) => state.activeView;
export const selectConversationMode = (state: ChatState) => state.conversationMode;
export const selectDraftContent = (state: ChatState) => state.draftContent;
export const selectEditingMessageId = (state: ChatState) => state.editingMessageId;
export const selectShowMessageTimestamps = (state: ChatState) => state.showMessageTimestamps;
export const selectSelectedMessage = (state: ChatState) => state.selectedMessage;
export const selectActiveConversation = (state: ChatState) =>
  state.conversations.find((c) => c.id === state.activeConversationId);
export const selectNonArchivedConversations = (state: ChatState) =>
  state.conversations.filter((c) => !c.archived);
export const selectPinnedConversations = (state: ChatState) =>
  state.conversations.filter((c) => c.pinned && !c.archived);
export const selectToolTimelineByMessage = (state: ChatState) => state.toolTimelineByMessage;
export const selectThinkingByMessage = (state: ChatState) => state.thinkingByMessage;
export const selectAgenticLoopStatus = (state: ChatState) => state.agenticLoopStatus;

const IS_TEST_ENVIRONMENT =
  typeof process !== 'undefined' && (process.env['NODE_ENV'] === 'test' || process.env['VITEST']);

type ChatStoreModelSubscriptionState = {
  initialized: boolean;
  pending: Promise<void> | null;
  unsubscribe: (() => void) | null;
};

const CHAT_STORE_MODEL_SUBSCRIPTION_STATE = Symbol.for(
  'agiworkforce.chatStore.modelStoreSubscriptionState',
);

function getChatStoreModelSubscriptionState(): ChatStoreModelSubscriptionState {
  const globalScope = globalThis as typeof globalThis & {
    [CHAT_STORE_MODEL_SUBSCRIPTION_STATE]?: ChatStoreModelSubscriptionState;
  };
  if (!globalScope[CHAT_STORE_MODEL_SUBSCRIPTION_STATE]) {
    globalScope[CHAT_STORE_MODEL_SUBSCRIPTION_STATE] = {
      initialized: false,
      pending: null,
      unsubscribe: null,
    };
  }
  return globalScope[CHAT_STORE_MODEL_SUBSCRIPTION_STATE];
}

export async function initializeChatStoreModelStoreSubscription(): Promise<void> {
  const subscriptionState = getChatStoreModelSubscriptionState();
  if (subscriptionState.initialized) return;
  if (subscriptionState.pending) return subscriptionState.pending;

  subscriptionState.pending = (async () => {
    try {
      const modelStore = useModelStore as
        | {
            getState?: () => { selectedModel: string | null };
            subscribe?: (
              selector: (state: { selectedModel: string | null }) => string | null,
              listener: (selectedModel: string | null) => void,
            ) => () => void;
          }
        | undefined;
      if (!modelStore || typeof modelStore.getState !== 'function') return;

      const selectedModel = modelStore.getState().selectedModel;
      if (selectedModel)
        useChatViewStore.getState().updateTokenUsage({ max: getModelContextWindow(selectedModel) });

      if (typeof modelStore.subscribe === 'function') {
        subscriptionState.unsubscribe?.();
        subscriptionState.unsubscribe = modelStore.subscribe(
          (state) => state.selectedModel,
          (nextSelectedModel) => {
            if (nextSelectedModel)
              useChatViewStore
                .getState()
                .updateTokenUsage({ max: getModelContextWindow(nextSelectedModel) });
          },
        );
      }
      subscriptionState.initialized = true;
    } catch (err) {
      console.warn('[chatStore] Failed to load modelStore for cross-store subscription:', err);
    } finally {
      subscriptionState.pending = null;
    }
  })();

  return subscriptionState.pending;
}

if (typeof window !== 'undefined' && !IS_TEST_ENVIRONMENT) {
  void initializeChatStoreModelStoreSubscription();
  initializeChatViewModelSubscription();
}
