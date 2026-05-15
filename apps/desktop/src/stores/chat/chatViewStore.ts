import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { storageFallback } from '../../utils/localStorage';
import { getModelContextWindow } from '../../constants/llm';
import { useModelStore } from '../modelStore';
import type { FocusMode, ActiveView, ConversationMode, Citation, TokenUsage } from './types';

function getActiveModelContextWindow(): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useModelStore: ms } = require('../modelStore') as {
      useModelStore: { getState: () => { selectedModel: string | null } };
    };
    const selectedModel = ms.getState().selectedModel;
    if (selectedModel) {
      return getModelContextWindow(selectedModel);
    }
  } catch {
    // modelStore not yet initialized
  }
  return 128_000;
}

export interface ChatViewState {
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
  resetViewState: () => void;
}

const initialViewState = {
  focusMode: null as FocusMode,
  activeView: 'chat' as ActiveView,
  conversationMode: 'auto' as ConversationMode,
  draftContent: '',
  editingMessageId: null as string | null,
  showMessageTimestamps: true,
  selectedMessage: null as string | null,
  citations: [] as Citation[],
  tokenUsage: {
    current: 0,
    inputTokens: 0,
    outputTokens: 0,
    max: 128_000,
    percentage: 0,
    estimatedCost: 0,
  } as TokenUsage,
};

export const useChatViewStore = create<ChatViewState>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get) => ({
          ...initialViewState,
          tokenUsage: {
            ...initialViewState.tokenUsage,
            max: getActiveModelContextWindow(),
          },

          setFocusMode: (mode) =>
            set(
              (state) => {
                state.focusMode = mode;
              },
              undefined,
              'chatView/setFocusMode',
            ),

          setActiveView: (view) =>
            set(
              (state) => {
                state.activeView = view;
              },
              undefined,
              'chatView/setActiveView',
            ),

          setConversationMode: (mode) =>
            set(
              (state) => {
                state.conversationMode = mode;
              },
              undefined,
              'chatView/setConversationMode',
            ),

          setDraftContent: (value) =>
            set(
              (state) => {
                state.draftContent = value;
              },
              undefined,
              'chatView/setDraftContent',
            ),

          startEditingMessage: (id, content) =>
            set(
              (state) => {
                state.editingMessageId = id;
                state.draftContent = content;
              },
              undefined,
              'chatView/startEditingMessage',
            ),

          cancelEditing: () =>
            set(
              (state) => {
                state.editingMessageId = null;
                state.draftContent = '';
              },
              undefined,
              'chatView/cancelEditing',
            ),

          setSelectedMessage: (id) =>
            set(
              (state) => {
                state.selectedMessage = id;
              },
              undefined,
              'chatView/setSelectedMessage',
            ),

          toggleMessageTimestamps: () =>
            set(
              (state) => {
                state.showMessageTimestamps = !state.showMessageTimestamps;
              },
              undefined,
              'chatView/toggleMessageTimestamps',
            ),

          addCitation: (citation) =>
            set(
              (state) => {
                const newCitation: Citation = {
                  id: crypto.randomUUID(),
                  timestamp: new Date(),
                  ...citation,
                };
                state.citations.push(newCitation);
              },
              undefined,
              'chatView/addCitation',
            ),

          getCitationByIndex: (index) => get().citations.find((c) => c.index === index),

          clearCitations: () =>
            set(
              (state) => {
                state.citations = [];
              },
              undefined,
              'chatView/clearCitations',
            ),

          updateTokenUsage: (usage) =>
            set(
              (state) => {
                state.tokenUsage = { ...state.tokenUsage, ...usage };
                if (state.tokenUsage.max > 0) {
                  state.tokenUsage.percentage =
                    (state.tokenUsage.current / state.tokenUsage.max) * 100;
                }
              },
              undefined,
              'chatView/updateTokenUsage',
            ),

          getTokenPercentage: () => get().tokenUsage.percentage,

          resetViewState: () =>
            set(
              (state) => {
                state.focusMode = null;
                state.activeView = 'chat';
                state.conversationMode = 'auto';
                state.draftContent = '';
                state.editingMessageId = null;
                state.selectedMessage = null;
                state.citations = [];
                state.tokenUsage = {
                  current: 0,
                  inputTokens: 0,
                  outputTokens: 0,
                  max: getActiveModelContextWindow(),
                  percentage: 0,
                  estimatedCost: 0,
                };
              },
              undefined,
              'chatView/resetViewState',
            ),
        })),
      ),
      {
        name: 'chat-view-storage',
        version: 1,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          focusMode: state.focusMode,
          showMessageTimestamps: state.showMessageTimestamps,
        }),
      },
    ),
    { name: 'ChatViewStore', enabled: import.meta.env.DEV },
  ),
);

// Cross-store subscription: update tokenUsage.max when selected model changes
const IS_TEST_ENVIRONMENT =
  typeof process !== 'undefined' && (process.env['NODE_ENV'] === 'test' || process.env['VITEST']);

type ModelSubscriptionState = { initialized: boolean; unsubscribe: (() => void) | null };
const MODEL_SUB_KEY = Symbol.for('agiworkforce.chatViewStore.modelSubscription');

function getModelSubState(): ModelSubscriptionState {
  const g = globalThis as typeof globalThis & { [MODEL_SUB_KEY]?: ModelSubscriptionState };
  if (!g[MODEL_SUB_KEY]) g[MODEL_SUB_KEY] = { initialized: false, unsubscribe: null };
  return g[MODEL_SUB_KEY];
}

export function initializeChatViewModelSubscription(): void {
  const sub = getModelSubState();
  if (sub.initialized || IS_TEST_ENVIRONMENT) return;

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

    if (!modelStore?.getState) return;

    const selected = modelStore.getState().selectedModel;
    if (selected) {
      useChatViewStore.getState().updateTokenUsage({ max: getModelContextWindow(selected) });
    }

    if (typeof modelStore.subscribe === 'function') {
      sub.unsubscribe?.();
      sub.unsubscribe = modelStore.subscribe(
        (state) => state.selectedModel,
        (next) => {
          if (next) {
            useChatViewStore.getState().updateTokenUsage({ max: getModelContextWindow(next) });
          }
        },
      );
    }

    sub.initialized = true;
  } catch {
    // modelStore not yet available
  }
}

export function teardownChatViewModelSubscription(): void {
  const sub = getModelSubState();
  sub.unsubscribe?.();
  sub.unsubscribe = null;
  sub.initialized = false;
}

// Selectors
export const selectFocusMode = (state: ChatViewState) => state.focusMode;
export const selectActiveView = (state: ChatViewState) => state.activeView;
export const selectConversationMode = (state: ChatViewState) => state.conversationMode;
export const selectDraftContent = (state: ChatViewState) => state.draftContent;
export const selectEditingMessageId = (state: ChatViewState) => state.editingMessageId;
export const selectShowMessageTimestamps = (state: ChatViewState) => state.showMessageTimestamps;
export const selectSelectedMessage = (state: ChatViewState) => state.selectedMessage;
export const selectCitations = (state: ChatViewState) => state.citations;
export const selectTokenUsage = (state: ChatViewState) => state.tokenUsage;
