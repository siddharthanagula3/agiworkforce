import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  Conversation,
  ConversationUI,
  Message,
  MessageUI,
  CreateConversationRequest,
  UpdateConversationRequest,
  ConversationStats,
  ChatRoutingPreferences,
  ChatStreamStartPayload,
  ChatStreamChunkPayload,
  ChatStreamEndPayload,
} from '../types/chat';
import type { CaptureResult } from '../types/capture';

interface ChatState {
  conversations: ConversationUI[];
  activeConversationId: number | null;
  messages: MessageUI[];
  loading: boolean;
  error: string | null;
  pinnedConversations: number[];

  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: number) => Promise<void>;
  createConversation: (title: string) => Promise<number>;
  updateConversation: (id: number, title: string) => Promise<void>;
  deleteConversation: (id: number) => Promise<void>;
  selectConversation: (id: number) => Promise<void>;
  sendMessage: (
    content: string,
    attachments?: File[],
    captures?: CaptureResult[],
    routing?: ChatRoutingPreferences,
  ) => Promise<void>;
  getStats: (conversationId: number) => Promise<ConversationStats>;
  togglePinnedConversation: (id: number) => Promise<void>;
  renameConversation: (id: number, title: string) => Promise<void>;
  editMessage: (id: number, content: string) => Promise<void>;
  deleteMessage: (id: number) => Promise<void>;
  reset: () => void;
}

function toMessageUI(message: Message): MessageUI {
  return {
    ...message,
    timestamp: new Date(message.created_at),
    streaming: false,
  };
}

function toConversationUI(
  conversation: Conversation,
  messageCount: number = 0,
  lastMessage?: string,
): ConversationUI {
  return {
    ...conversation,
    updatedAt: new Date(conversation.updated_at),
    messageCount,
    lastMessage,
    unreadCount: 0,
  };
}

function sortConversations(conversations: ConversationUI[]): ConversationUI[] {
  return conversations.slice().sort((a, b) => {
    if (Boolean(b.pinned) !== Boolean(a.pinned)) {
      return Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    }
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}

function applyPinnedState(
  conversations: ConversationUI[],
  pinnedSet: Set<number>,
): ConversationUI[] {
  return sortConversations(
    conversations.map((conv) => ({
      ...conv,
      pinned: pinnedSet.has(conv.id),
    })),
  );
}

const storageFallback: Storage = {
  get length() {
    return 0;
  },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

const chatStorage = createJSONStorage<{
  activeConversationId: number | null;
  pinnedConversations: number[];
}>(() => (typeof window === 'undefined' ? storageFallback : window.localStorage));

interface ChatSendMessageResponse {
  conversation: Conversation;
  user_message: Message;
  assistant_message: Message;
  stats: ConversationStats;
  last_message: string | null;
}

let streamListenersInitialized = false;

export const useChatStore = create<ChatState>()(
  persist(
    immer((set, get) => ({
      conversations: [],
      activeConversationId: null,
      messages: [],
      loading: false,
      error: null,
      pinnedConversations: [],

      loadConversations: async () => {
        set({ loading: true, error: null });
        try {
          const conversations = await invoke<Conversation[]>('chat_get_conversations');

          const conversationsWithStats = await Promise.all(
            conversations.map(async (conv) => {
              const stats = await invoke<ConversationStats>('chat_get_conversation_stats', {
                conversationId: conv.id,
              });

              const messages = await invoke<Message[]>('chat_get_messages', {
                conversationId: conv.id,
              });

              const lastMessage: string | undefined =
                messages.length > 0 ? messages[messages.length - 1]?.content : undefined;

              return toConversationUI(conv, stats.message_count, lastMessage);
            }),
          );

          set((state) => {
            state.pinnedConversations = state.pinnedConversations.filter((id) =>
              conversationsWithStats.some((conv) => conv.id === id),
            );
            const pinnedSet = new Set(state.pinnedConversations);
            state.conversations = applyPinnedState(conversationsWithStats, pinnedSet);
            state.loading = false;
          });
        } catch (error) {
          console.error('Failed to load conversations:', error);
          set({ error: String(error), loading: false });
        }
      },

      loadMessages: async (conversationId: number) => {
        set({ loading: true, error: null });
        try {
          const messages = await invoke<Message[]>('chat_get_messages', { conversationId });
          set({
            messages: messages.map(toMessageUI),
            loading: false,
          });
        } catch (error) {
          console.error('Failed to load messages:', error);
          set({ error: String(error), loading: false });
        }
      },

      createConversation: async (title: string) => {
        set({ loading: true, error: null });
        try {
          const request: CreateConversationRequest = { title };
          const conversation = await invoke<Conversation>('chat_create_conversation', { request });

          const conversationUI = toConversationUI(conversation, 0);
          set((state) => {
            const pinnedSet = new Set(state.pinnedConversations);
            state.conversations = applyPinnedState(
              [conversationUI, ...state.conversations],
              pinnedSet,
            );
            state.activeConversationId = conversation.id;
            state.messages = [];
            state.loading = false;
          });

          return conversation.id;
        } catch (error) {
          console.error('Failed to create conversation:', error);
          set({ error: String(error), loading: false });
          throw error;
        }
      },

      updateConversation: async (id: number, title: string) => {
        try {
          const request: UpdateConversationRequest = { title };
          await invoke('chat_update_conversation', { id, request });

          set((state) => {
            const pinnedSet = new Set(state.pinnedConversations);
            const updated = state.conversations.map((conv) =>
              conv.id === id ? { ...conv, title } : conv,
            );
            state.conversations = applyPinnedState(updated, pinnedSet);
          });
        } catch (error) {
          console.error('Failed to update conversation:', error);
          set({ error: String(error) });
          throw error;
        }
      },

      deleteConversation: async (id: number) => {
        try {
          await invoke('chat_delete_conversation', { id });

          set((state) => {
            state.pinnedConversations = state.pinnedConversations.filter((pid) => pid !== id);
            const pinnedSet = new Set(state.pinnedConversations);
            const remaining = state.conversations.filter((conv) => conv.id !== id);
            state.conversations = applyPinnedState(remaining, pinnedSet);
            if (state.activeConversationId === id) {
              state.activeConversationId = null;
              state.messages = [];
            }
          });
        } catch (error) {
          console.error('Failed to delete conversation:', error);
          set({ error: String(error) });
          throw error;
        }
      },

      selectConversation: async (id: number) => {
        set({ activeConversationId: id });
        await get().loadMessages(id);
      },

      sendMessage: async (
        content: string,
        attachments?: File[],
        captures?: CaptureResult[],
        routing?: ChatRoutingPreferences,
      ) => {
        if (!content.trim()) {
          return;
        }

        const pendingAttachments = attachments ?? [];
        const pendingCaptures = captures ?? [];

        if (pendingAttachments.length > 0 || pendingCaptures.length > 0) {
          console.info(
            `[chatStore] attachment handling pending. Files: ${pendingAttachments.length}, captures: ${pendingCaptures.length}`,
          );
        }

        const conversationId = get().activeConversationId;

        set({ loading: true, error: null });

        // Detect goal-like messages and auto-submit to AGI
        const goalKeywords = [
          'create',
          'build',
          'make',
          'automate',
          'implement',
          'develop',
          'write',
          'generate',
          'set up',
          'configure',
          'install',
          'deploy',
          'run',
          'execute',
          'perform',
          'do',
          'complete',
          'finish',
          'accomplish',
          'achieve',
          'solve',
          'fix',
          'update',
          'modify',
        ];
        const isGoalLike =
          goalKeywords.some((keyword) => content.toLowerCase().includes(keyword.toLowerCase())) &&
          (content.length > 20 || // Longer messages are more likely to be goals
            content.includes('please') ||
            content.includes('can you') ||
            content.includes('I need') ||
            content.includes('I want'));

        if (isGoalLike) {
          try {
            // Submit to AGI in parallel with chat message
            const agiPromise = invoke('agi_submit_goal', {
              request: {
                description: content,
                priority: 'medium',
                deadline: null,
                success_criteria: null,
              },
            }).catch((error) => {
              console.warn('[chatStore] Failed to submit goal to AGI:', error);
            });

            // Don't await AGI submission - let it run in background
            void agiPromise;
          } catch (error) {
            console.warn('[chatStore] Error submitting goal to AGI:', error);
          }
        }

        try {
          const response = await invoke<ChatSendMessageResponse>('chat_send_message', {
            request: {
              conversationId,
              content,
              provider: routing?.provider,
              model: routing?.model,
              strategy: routing?.strategy,
              stream: true,
            },
          });

          const conversationUI = toConversationUI(
            response.conversation,
            response.stats.message_count,
            response.last_message ?? response.assistant_message.content,
          );

          set((state) => {
            const isSameConversation = state.activeConversationId === response.conversation.id;
            const userMessageUI = toMessageUI(response.user_message);
            const assistantMessageUI = toMessageUI(response.assistant_message);
            assistantMessageUI.streaming = false;

            if (isSameConversation) {
              const filtered = state.messages.filter(
                (msg) => msg.id !== userMessageUI.id && msg.id !== assistantMessageUI.id,
              );
              state.messages = [...filtered, userMessageUI, assistantMessageUI].sort(
                (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
              );
            } else {
              state.messages = [userMessageUI, assistantMessageUI];
            }

            const otherConversations = state.conversations.filter(
              (conv) => conv.id !== response.conversation.id,
            );
            const pinnedSet = new Set(state.pinnedConversations);
            state.conversations = applyPinnedState(
              [conversationUI, ...otherConversations],
              pinnedSet,
            );
            state.activeConversationId = response.conversation.id;
            state.loading = false;
          });
        } catch (error) {
          console.error('Failed to send message:', error);
          set({ error: String(error), loading: false });
          throw error;
        }
      },

      getStats: async (conversationId: number) => {
        try {
          return await invoke<ConversationStats>('chat_get_conversation_stats', {
            conversationId,
          });
        } catch (error) {
          console.error('Failed to get stats:', error);
          throw error;
        }
      },

      togglePinnedConversation: async (id: number) => {
        set((state) => {
          const pinnedSet = new Set(state.pinnedConversations);
          if (pinnedSet.has(id)) {
            pinnedSet.delete(id);
          } else {
            pinnedSet.add(id);
          }
          state.pinnedConversations = Array.from(pinnedSet);
          state.conversations = applyPinnedState(state.conversations, pinnedSet);
        });
      },

      renameConversation: async (id: number, title: string) => {
        const trimmed = title.trim();
        if (!trimmed) {
          throw new Error('Title cannot be empty');
        }
        await get().updateConversation(id, trimmed);
      },

      editMessage: async (id: number, content: string) => {
        const trimmed = content.trim();
        if (!trimmed) {
          throw new Error('Message cannot be empty');
        }

        const stateSnapshot = get();
        const targetMessage = stateSnapshot.messages.find((message) => message.id === id);
        const previousContent = targetMessage?.content;

        try {
          const updated = await invoke<Message>('chat_update_message', { id, content: trimmed });

          set((state) => {
            state.messages = state.messages.map((message) =>
              message.id === updated.id
                ? ({
                    ...message,
                    content: updated.content,
                    created_at: updated.created_at,
                    timestamp: new Date(updated.created_at),
                    tokens: updated.tokens !== undefined ? updated.tokens : message.tokens,
                    cost: updated.cost !== undefined ? updated.cost : message.cost,
                  } as MessageUI)
                : message,
            );

            const pinnedSet = new Set(state.pinnedConversations);
            state.conversations = applyPinnedState(
              state.conversations.map((conversation) => {
                if (conversation.id !== updated.conversation_id) {
                  return conversation;
                }

                const isActiveConversation = state.activeConversationId === updated.conversation_id;
                const lastMessageInActiveConversation =
                  isActiveConversation && state.messages.length > 0
                    ? state.messages[state.messages.length - 1]
                    : undefined;

                const isLastMessageActive = lastMessageInActiveConversation?.id === updated.id;
                const matchesPreviousLast =
                  previousContent !== undefined && conversation.lastMessage === previousContent;

                if (!isLastMessageActive && !matchesPreviousLast) {
                  return conversation;
                }

                return {
                  ...conversation,
                  lastMessage: updated.content,
                };
              }),
              pinnedSet,
            );
          });
        } catch (error) {
          console.error('Failed to edit message:', error);
          set({ error: String(error) });
          throw error;
        }
      },

      deleteMessage: async (id: number) => {
        const stateSnapshot = get();
        const targetMessage = stateSnapshot.messages.find((message) => message.id === id);
        const conversationId = targetMessage?.conversation_id ?? stateSnapshot.activeConversationId;
        const messageWasTracked = Boolean(targetMessage);

        try {
          await invoke('chat_delete_message', { id });

          set((state) => {
            state.messages = state.messages.filter((message) => message.id !== id);

            if (conversationId == null) {
              return;
            }

            const pinnedSet = new Set(state.pinnedConversations);
            state.conversations = applyPinnedState(
              state.conversations.map((conversation) => {
                if (conversation.id !== conversationId) {
                  return conversation;
                }

                const nextMessageCount = messageWasTracked
                  ? Math.max(0, conversation.messageCount - 1)
                  : conversation.messageCount;
                const isActiveConversation = state.activeConversationId === conversationId;
                const lastMessageInActiveConversation =
                  isActiveConversation && state.messages.length > 0
                    ? state.messages[state.messages.length - 1]
                    : undefined;

                let nextLastMessage = conversation.lastMessage;
                if (isActiveConversation) {
                  nextLastMessage = lastMessageInActiveConversation?.content;
                } else if (messageWasTracked && nextMessageCount === 0) {
                  nextLastMessage = undefined;
                } else if (
                  messageWasTracked &&
                  targetMessage &&
                  conversation.lastMessage !== undefined &&
                  conversation.lastMessage === targetMessage.content
                ) {
                  nextLastMessage =
                    lastMessageInActiveConversation?.content ?? conversation.lastMessage;
                }

                return {
                  ...conversation,
                  messageCount: nextMessageCount,
                  lastMessage: nextLastMessage,
                };
              }),
              pinnedSet,
            );
          });
        } catch (error) {
          console.error('Failed to delete message:', error);
          set({ error: String(error) });
          throw error;
        }
      },

      reset: () => {
        set({
          conversations: [],
          activeConversationId: null,
          messages: [],
          loading: false,
          error: null,
          pinnedConversations: [],
        });
      },
    })),
    {
      name: 'agiworkforce-chat',
      storage: chatStorage,
      partialize: (state) => ({
        activeConversationId: state.activeConversationId,
        pinnedConversations: state.pinnedConversations,
      }),
    },
  ),
);

if (typeof window !== 'undefined') {
  void initializeStreamListeners();
  void initializeAGIListeners();
}

async function initializeAGIListeners() {
  try {
    // Listen for AGI goal events
    await listen(
      'agi:goal:submitted',
      ({ payload }: { payload: { goal_id: string; description: string } }) => {
        console.log('[AGI] Goal submitted:', payload);
        // Could add a notification or update UI here
      },
    );

    await listen(
      'agi:goal:progress',
      ({
        payload,
      }: {
        payload: {
          goal_id: string;
          progress_percent: number;
          completed_steps: number;
          total_steps: number;
        };
      }) => {
        console.log(
          `[AGI] Goal progress: ${payload.progress_percent}% (${payload.completed_steps}/${payload.total_steps})`,
        );
        // Could update UI with progress bar here
      },
    );

    await listen('agi:goal:achieved', ({ payload }: { payload: { goal_id: string } }) => {
      console.log('[AGI] Goal achieved:', payload.goal_id);
      // Could show success notification here
    });

    await listen(
      'agi:goal:error',
      ({ payload }: { payload: { goal_id: string; error: string } }) => {
        console.error('[AGI] Goal error:', payload);
        // Could show error notification here
      },
    );
  } catch (error) {
    console.error('[chatStore] Failed to initialize AGI listeners:', error);
  }
}

async function initializeStreamListeners() {
  if (streamListenersInitialized) {
    return;
  }
  streamListenersInitialized = true;

  try {
    await listen<ChatStreamStartPayload>('chat:stream-start', ({ payload }) => {
      handleStreamStart(payload);
    });
    await listen<ChatStreamChunkPayload>('chat:stream-chunk', ({ payload }) => {
      handleStreamChunk(payload);
    });
    await listen<ChatStreamEndPayload>('chat:stream-end', ({ payload }) => {
      handleStreamEnd(payload);
    });
  } catch (error) {
    console.error('[chatStore] Failed to initialize stream listeners:', error);
    streamListenersInitialized = false;
  }
}

function handleStreamStart(payload: ChatStreamStartPayload) {
  useChatStore.setState((state) => {
    let conversationsChanged = false;
    state.conversations = state.conversations.map((conversation) => {
      if (conversation.id !== payload.conversationId) {
        return conversation;
      }
      conversationsChanged = true;
      return {
        ...conversation,
        updatedAt: new Date(payload.createdAt),
        lastMessage: '',
      };
    });

    if (conversationsChanged) {
      const pinnedSet = new Set(state.pinnedConversations);
      state.conversations = applyPinnedState(state.conversations, pinnedSet);
    }

    if (state.activeConversationId === payload.conversationId) {
      const timestamp = new Date(payload.createdAt);
      const hasExisting = state.messages.some((message) => message.id === payload.messageId);

      if (hasExisting) {
        state.messages = state.messages.map((message) =>
          message.id === payload.messageId ? { ...message, timestamp, streaming: true } : message,
        );
      } else {
        const placeholder: MessageUI = {
          id: payload.messageId,
          conversation_id: payload.conversationId,
          role: 'assistant',
          content: '',
          created_at: payload.createdAt,
          timestamp,
          streaming: true,
        };
        state.messages = [...state.messages, placeholder];
      }
    }
  });
}

function handleStreamChunk(payload: ChatStreamChunkPayload) {
  useChatStore.setState((state) => {
    let conversationsChanged = false;
    state.conversations = state.conversations.map((conversation) => {
      if (conversation.id !== payload.conversationId) {
        return conversation;
      }
      conversationsChanged = true;
      return {
        ...conversation,
        lastMessage: payload.content,
        updatedAt: new Date(),
      };
    });

    if (conversationsChanged) {
      const pinnedSet = new Set(state.pinnedConversations);
      state.conversations = applyPinnedState(state.conversations, pinnedSet);
    }

    if (state.activeConversationId === payload.conversationId) {
      const hasExisting = state.messages.some((message) => message.id === payload.messageId);

      if (hasExisting) {
        state.messages = state.messages.map((message) =>
          message.id === payload.messageId
            ? { ...message, content: payload.content, streaming: true }
            : message,
        );
      } else {
        const timestamp = new Date();
        const placeholder: MessageUI = {
          id: payload.messageId,
          conversation_id: payload.conversationId,
          role: 'assistant',
          content: payload.content,
          created_at: timestamp.toISOString(),
          timestamp,
          streaming: true,
        };
        state.messages = [...state.messages, placeholder];
      }
    }
  });
}

function handleStreamEnd(payload: ChatStreamEndPayload) {
  useChatStore.setState((state) => {
    if (state.activeConversationId !== payload.conversationId) {
      return;
    }

    const hasExisting = state.messages.some((message) => message.id === payload.messageId);
    if (!hasExisting) {
      return;
    }

    state.messages = state.messages.map((message) =>
      message.id === payload.messageId ? { ...message, streaming: false } : message,
    );
  });
}
