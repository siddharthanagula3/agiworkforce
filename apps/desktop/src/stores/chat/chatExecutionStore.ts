import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../../lib/tauri-mock';
import type { ToolLabelEntry } from '@agiworkforce/types';
import type {
  EnhancedMessage,
  InlinePanel,
  InlinePanelContent,
  PendingUserMessage,
  BranchSummary,
} from './types';
import { DEFAULT_BRANCH_ID } from './types';

export type { ToolLabelEntry };

export interface ChatExecutionState {
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

  activeBranchId: string;
  branches: BranchSummary[];

  lastStreamActivityAt: number | null;
  streamWatchdogTimerId: ReturnType<typeof setTimeout> | null;

  // Streaming actions
  setIsLoading: (loading: boolean) => void;
  setLoadingMessages: (loading: boolean) => void;
  setStreamingMessage: (id: string | null) => void;
  appendToStreamingMessage: (content: string) => void;
  markStreamActivity: () => void;
  startStreamWatchdog: () => void;
  stopStreamWatchdog: () => void;
  handleStreamInactivityTimeout: () => void;

  // Inline panel actions — these delegate mutation to chatStore via callback
  addInlinePanel: (messageId: string, panel: InlinePanel) => void;
  updateInlinePanel: (
    messageId: string,
    panelId: string,
    content: Partial<InlinePanelContent>,
  ) => void;
  toggleInlinePanelCollapse: (messageId: string, panelId: string) => void;

  // Pending message actions
  addPendingMessage: (message: PendingUserMessage) => void;
  removePendingMessage: (id: string) => void;
  clearPendingMessages: () => void;
  getPendingMessagesCount: () => number;

  // Tool timeline actions
  addToolTimelineEntry: (messageId: string, entry: ToolLabelEntry) => void;
  updateToolTimelineEntry: (
    messageId: string,
    entryId: string,
    updates: Partial<ToolLabelEntry>,
  ) => void;

  // Thinking content actions
  appendThinkingContent: (messageId: string, delta: string) => void;
  clearThinkingContent: (messageId: string) => void;

  // Agentic loop
  setAgenticLoopStatus: (status: ChatExecutionState['agenticLoopStatus']) => void;

  // Branching
  loadBranches: (conversationId: number) => Promise<void>;
  switchBranch: (conversationId: number, branchId: string) => Promise<void>;
  forkAndRegenerate: (
    conversationId: number,
    messageId: number,
    newContent: string,
  ) => Promise<void>;
  deleteBranch: (conversationId: number, branchId: string) => Promise<void>;

  // Reset
  resetExecutionState: () => void;
}

// Module-level dedup guard for tool timeline entries
const _recentTimelineIds = new Set<string>();

// Inline panel mutations are applied to the message arrays owned by chatStore.
// We accept a patcher callback so chatExecutionStore stays independent.
type MessagePatcher = (
  fn: (messages: EnhancedMessage[], convoMessages: EnhancedMessage[] | undefined) => void,
) => void;

let _patchMessages: MessagePatcher | null = null;

export function registerExecutionMessagePatcher(patcher: MessagePatcher): void {
  _patchMessages = patcher;
}

export const useChatExecutionStore = create<ChatExecutionState>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        isLoading: false,
        isLoadingMessages: false,
        isStreaming: false,
        currentStreamingMessageId: null as string | null,
        pendingMessages: [] as PendingUserMessage[],
        toolTimelineByMessage: {} as Record<string, ToolLabelEntry[]>,
        thinkingByMessage: {} as Record<string, string>,
        agenticLoopStatus: null,
        activeBranchId: DEFAULT_BRANCH_ID,
        branches: [] as BranchSummary[],
        lastStreamActivityAt: null as number | null,
        streamWatchdogTimerId: null as ReturnType<typeof setTimeout> | null,

        setIsLoading: (loading) =>
          set(
            (state) => {
              state.isLoading = loading;
            },
            undefined,
            'exec/setIsLoading',
          ),

        setLoadingMessages: (loading) =>
          set(
            (state) => {
              state.isLoadingMessages = loading;
            },
            undefined,
            'exec/setLoadingMessages',
          ),

        setStreamingMessage: (id) => {
          set(
            (state) => {
              state.currentStreamingMessageId = id;
              state.isStreaming = id !== null;
            },
            undefined,
            'exec/setStreamingMessage',
          );
          if (id !== null) {
            get().startStreamWatchdog();
          } else {
            get().stopStreamWatchdog();
          }
        },

        appendToStreamingMessage: (content) => {
          // Delegates to chatStore's message arrays via the registered patcher
          if (_patchMessages) {
            const currentId = get().currentStreamingMessageId;
            if (!currentId) return;
            _patchMessages((messages, convoMessages) => {
              const msg = messages.find((m) => m.id === currentId);
              if (msg) msg.content += content;
              const cMsg = convoMessages?.find((m) => m.id === currentId);
              if (cMsg) cMsg.content += content;
            });
          }
        },

        markStreamActivity: () =>
          set(
            (state) => {
              state.lastStreamActivityAt = Date.now();
            },
            undefined,
            'exec/markStreamActivity',
          ),

        startStreamWatchdog: () => {
          const existing = get().streamWatchdogTimerId;
          if (existing !== null) clearInterval(existing);

          let timeoutSeconds = 30;
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { useSettingsStore } = require('../settingsStore') as {
              useSettingsStore: {
                getState: () => {
                  executionPreferences: { streamInactivityTimeoutSeconds: number };
                };
              };
            };
            timeoutSeconds =
              useSettingsStore.getState().executionPreferences.streamInactivityTimeoutSeconds;
          } catch {
            // use default
          }

          const checkInterval = Math.max(5000, (timeoutSeconds * 1000) / 2);
          const timerId = setInterval(() => {
            const state = get();
            if (!state.isStreaming) {
              get().stopStreamWatchdog();
              return;
            }
            const lastActivity = state.lastStreamActivityAt;
            if (lastActivity === null) return;
            if (Date.now() - lastActivity >= timeoutSeconds * 1000) {
              get().handleStreamInactivityTimeout();
            }
          }, checkInterval);

          set(
            (state) => {
              state.streamWatchdogTimerId = timerId as unknown as ReturnType<typeof setTimeout>;
              state.lastStreamActivityAt = Date.now();
            },
            undefined,
            'exec/startStreamWatchdog',
          );
        },

        stopStreamWatchdog: () => {
          const timerId = get().streamWatchdogTimerId;
          if (timerId !== null) clearInterval(timerId as unknown as ReturnType<typeof setInterval>);
          set(
            (state) => {
              state.streamWatchdogTimerId = null;
              state.lastStreamActivityAt = null;
            },
            undefined,
            'exec/stopStreamWatchdog',
          );
        },

        handleStreamInactivityTimeout: () => {
          const { currentStreamingMessageId, isStreaming } = get();
          if (!isStreaming) {
            get().stopStreamWatchdog();
            return;
          }

          console.warn(
            '[ChatExecutionStore] Stream inactivity timeout for message:',
            currentStreamingMessageId,
          );

          set(
            (s) => {
              s.isStreaming = false;
              s.isLoading = false;
              s.currentStreamingMessageId = null;
            },
            undefined,
            'exec/handleStreamInactivityTimeout',
          );

          // Propagate timeout error to message content via patcher
          if (_patchMessages && currentStreamingMessageId) {
            _patchMessages((messages, convoMessages) => {
              const msgIdx = messages.findIndex((m) => m.id === currentStreamingMessageId);
              if (msgIdx !== -1 && messages[msgIdx]) {
                messages[msgIdx]!.streaming = false;
                messages[msgIdx]!.error =
                  'Stream timed out due to inactivity. You can retry by sending your message again.';
              }
              const convoMsgIdx =
                convoMessages?.findIndex((m) => m.id === currentStreamingMessageId) ?? -1;
              if (convoMsgIdx !== -1 && convoMessages?.[convoMsgIdx]) {
                convoMessages[convoMsgIdx]!.streaming = false;
                convoMessages[convoMsgIdx]!.error =
                  'Stream timed out due to inactivity. You can retry by sending your message again.';
              }
            });
          }

          get().stopStreamWatchdog();

          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { toast } = require('sonner') as { toast: typeof import('sonner').toast };
            toast.warning(
              'Stream timed out due to inactivity. The response may be incomplete. You can retry by sending your message again.',
            );
          } catch {
            // toast not available in test environment
          }
        },

        // Inline panels delegate mutation to chatStore message arrays
        addInlinePanel: (messageId, panel) => {
          if (_patchMessages) {
            _patchMessages((messages, convoMessages) => {
              const applyAdd = (list: EnhancedMessage[]) => {
                const idx = list.findIndex((m) => m.id === messageId);
                if (idx !== -1 && list[idx]) {
                  if (!list[idx]!.inlinePanels) list[idx]!.inlinePanels = [];
                  list[idx]!.inlinePanels!.push(panel);
                }
              };
              applyAdd(messages);
              if (convoMessages) applyAdd(convoMessages);
            });
          }
        },

        updateInlinePanel: (messageId, panelId, content) => {
          if (_patchMessages) {
            _patchMessages((messages, convoMessages) => {
              const applyUpdate = (list: EnhancedMessage[]) => {
                const msgIdx = list.findIndex((m) => m.id === messageId);
                if (msgIdx !== -1 && list[msgIdx]?.inlinePanels) {
                  const panelIdx = list[msgIdx]!.inlinePanels!.findIndex((p) => p.id === panelId);
                  if (panelIdx !== -1 && list[msgIdx]!.inlinePanels![panelIdx]) {
                    list[msgIdx]!.inlinePanels![panelIdx]!.content = {
                      ...list[msgIdx]!.inlinePanels![panelIdx]!.content,
                      ...content,
                    };
                  }
                }
              };
              applyUpdate(messages);
              if (convoMessages) applyUpdate(convoMessages);
            });
          }
        },

        toggleInlinePanelCollapse: (messageId, panelId) => {
          if (_patchMessages) {
            _patchMessages((messages, convoMessages) => {
              const applyToggle = (list: EnhancedMessage[]) => {
                const msgIdx = list.findIndex((m) => m.id === messageId);
                if (msgIdx !== -1 && list[msgIdx]?.inlinePanels) {
                  const panelIdx = list[msgIdx]!.inlinePanels!.findIndex((p) => p.id === panelId);
                  if (panelIdx !== -1 && list[msgIdx]!.inlinePanels![panelIdx]) {
                    list[msgIdx]!.inlinePanels![panelIdx]!.isCollapsed =
                      !list[msgIdx]!.inlinePanels![panelIdx]!.isCollapsed;
                  }
                }
              };
              applyToggle(messages);
              if (convoMessages) applyToggle(convoMessages);
            });
          }
        },

        // Pending messages
        addPendingMessage: (message) =>
          set(
            (state) => {
              const existingIdx = state.pendingMessages.findIndex((m) => m.id === message.id);
              if (existingIdx === -1) {
                state.pendingMessages.push(message);
              } else {
                state.pendingMessages[existingIdx] = {
                  ...state.pendingMessages[existingIdx],
                  ...message,
                };
              }
            },
            undefined,
            'exec/addPendingMessage',
          ),

        removePendingMessage: (id) =>
          set(
            (state) => {
              state.pendingMessages = state.pendingMessages.filter((m) => m.id !== id);
            },
            undefined,
            'exec/removePendingMessage',
          ),

        clearPendingMessages: () =>
          set(
            (state) => {
              state.pendingMessages = [];
            },
            undefined,
            'exec/clearPendingMessages',
          ),

        getPendingMessagesCount: () => get().pendingMessages.length,

        // Tool timeline
        addToolTimelineEntry: (messageId, entry) =>
          set(
            (state) => {
              const dedupKey = `${messageId}:${entry.id}`;
              if (_recentTimelineIds.has(dedupKey)) return;
              if (!state.toolTimelineByMessage[messageId])
                state.toolTimelineByMessage[messageId] = [];
              const entries = state.toolTimelineByMessage[messageId]!;
              if (entries.some((e) => e.id === entry.id)) return;
              if (entries.length < 200) {
                entries.push(entry);
                _recentTimelineIds.add(dedupKey);
                setTimeout(() => _recentTimelineIds.delete(dedupKey), 10_000);
              }
            },
            undefined,
            'exec/addToolTimelineEntry',
          ),

        updateToolTimelineEntry: (messageId, entryId, updates) =>
          set(
            (state) => {
              const entries = state.toolTimelineByMessage[messageId];
              if (!entries) return;
              const idx = entries.findIndex((e) => e.id === entryId);
              if (idx !== -1 && entries[idx]) entries[idx] = { ...entries[idx]!, ...updates };
            },
            undefined,
            'exec/updateToolTimelineEntry',
          ),

        // Thinking content
        appendThinkingContent: (messageId, delta) =>
          set(
            (state) => {
              state.thinkingByMessage[messageId] =
                (state.thinkingByMessage[messageId] ?? '') + delta;
            },
            undefined,
            'exec/appendThinkingContent',
          ),

        clearThinkingContent: (messageId) =>
          set(
            (state) => {
              delete state.thinkingByMessage[messageId];
            },
            undefined,
            'exec/clearThinkingContent',
          ),

        // Agentic loop
        setAgenticLoopStatus: (status) =>
          set(
            (state) => {
              state.agenticLoopStatus = status;
            },
            undefined,
            'exec/setAgenticLoopStatus',
          ),

        // Branching — reads BackendMessage from chatStore conversion helper via invoke
        loadBranches: async (conversationId) => {
          try {
            const branches = await invoke<BranchSummary[]>('conversation_list_branches', {
              conversationId,
            });
            set(
              (state) => {
                state.branches = branches;
              },
              undefined,
              'exec/loadBranches',
            );
          } catch (error) {
            console.error('[ChatExecutionStore] Failed to load branches:', error);
          }
        },

        switchBranch: async (conversationId, branchId) => {
          try {
            // Import chatStore lazily to avoid circular deps at module init time
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { useChatStore } = require('./chatStore') as {
              useChatStore: {
                getState: () => {
                  activeConversationId: string | null;
                  setConversationMessages: (id: string, messages: EnhancedMessage[]) => void;
                };
              };
            };
            const currentConvoId = useChatStore.getState().activeConversationId;
            const rawMessages = await invoke<
              Array<{
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
              }>
            >('conversation_switch_branch', { conversationId, branchId });
            const enhanced: EnhancedMessage[] = rawMessages.map((msg) => ({
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
            }));
            // Only update if user hasn't switched conversations during the await
            if (useChatStore.getState().activeConversationId !== currentConvoId) return;
            set(
              (state) => {
                state.activeBranchId = branchId;
              },
              undefined,
              'exec/switchBranch',
            );
            if (currentConvoId)
              useChatStore.getState().setConversationMessages(currentConvoId, enhanced);
          } catch (error) {
            console.error('[ChatExecutionStore] Failed to switch branch:', error);
          }
        },

        forkAndRegenerate: async (conversationId, messageId, newContent) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { useChatStore } = require('./chatStore') as {
              useChatStore: {
                getState: () => {
                  activeConversationId: string | null;
                  setConversationMessages: (id: string, messages: EnhancedMessage[]) => void;
                };
              };
            };
            const currentConvoId = useChatStore.getState().activeConversationId;
            const branchName = `Edit at message ${messageId}`;
            const result = await invoke<{
              branch: BranchSummary;
              messages: Array<{
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
              }>;
            }>('conversation_fork', { conversationId, messageId, branchName });
            const enhanced: EnhancedMessage[] = result.messages.map((msg) => ({
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
            }));
            if (enhanced.length > 0 && newContent) {
              const lastMsg = enhanced[enhanced.length - 1];
              if (lastMsg && lastMsg.role === 'user') {
                lastMsg.content = newContent;
                lastMsg.metadata = { ...lastMsg.metadata, edited: true, editedAt: new Date() };
              }
            }
            if (useChatStore.getState().activeConversationId !== currentConvoId) return;
            set(
              (state) => {
                state.branches = [...state.branches, result.branch];
                state.activeBranchId = result.branch.id;
              },
              undefined,
              'exec/forkAndRegenerate',
            );
            if (currentConvoId)
              useChatStore.getState().setConversationMessages(currentConvoId, enhanced);
          } catch (error) {
            console.error('[ChatExecutionStore] Failed to fork conversation:', error);
          }
        },

        deleteBranch: async (conversationId, branchId) => {
          try {
            await invoke('conversation_delete_branch', { conversationId, branchId });
            const wasActive = get().activeBranchId === branchId;
            set(
              (state) => {
                state.branches = state.branches.filter((b) => b.id !== branchId);
                if (state.activeBranchId === branchId) state.activeBranchId = DEFAULT_BRANCH_ID;
              },
              undefined,
              'exec/deleteBranch',
            );
            if (wasActive) await get().switchBranch(conversationId, DEFAULT_BRANCH_ID);
          } catch (error) {
            console.error('[ChatExecutionStore] Failed to delete branch:', error);
          }
        },

        resetExecutionState: () =>
          set(
            (state) => {
              state.isLoading = false;
              state.isLoadingMessages = false;
              state.isStreaming = false;
              state.currentStreamingMessageId = null;
              state.pendingMessages = [];
              state.toolTimelineByMessage = {};
              state.thinkingByMessage = {};
              state.agenticLoopStatus = null;
              state.activeBranchId = DEFAULT_BRANCH_ID;
              state.branches = [];
              state.lastStreamActivityAt = null;
              state.streamWatchdogTimerId = null;
            },
            undefined,
            'exec/resetExecutionState',
          ),
      })),
    ),
    { name: 'ChatExecutionStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors
export const selectIsLoading = (state: ChatExecutionState) => state.isLoading;
export const selectIsLoadingMessages = (state: ChatExecutionState) => state.isLoadingMessages;
export const selectIsStreaming = (state: ChatExecutionState) => state.isStreaming;
export const selectCurrentStreamingMessageId = (state: ChatExecutionState) =>
  state.currentStreamingMessageId;
export const selectPendingMessages = (state: ChatExecutionState) => state.pendingMessages;
export const selectToolTimelineByMessage = (state: ChatExecutionState) =>
  state.toolTimelineByMessage;
export const selectThinkingByMessage = (state: ChatExecutionState) => state.thinkingByMessage;
export const selectAgenticLoopStatus = (state: ChatExecutionState) => state.agenticLoopStatus;
