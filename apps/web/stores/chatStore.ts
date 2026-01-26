'use client';

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';

// Types
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  model?: string;
  isStreaming?: boolean;
  attachments?: Attachment[];
  reactions?: { type: 'thumbsUp' | 'thumbsDown'; userId: string }[];
}

export interface Attachment {
  id: string;
  type: 'image' | 'file';
  name: string;
  size?: number;
  mimeType?: string;
  content?: string; // Base64 data URL
  url?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export type ModelTier = 'economy' | 'balanced' | 'premium';

export interface SelectedModel {
  id: string;
  name: string;
  provider: string;
  tier: ModelTier;
}

// Auto mode options with tier-based routing
export const AUTO_MODELS = {
  'auto-economy': {
    id: 'auto-economy',
    name: 'Auto (Economy)',
    description: 'Fastest, most cost-effective',
    tier: 'economy' as ModelTier,
  },
  'auto-balanced': {
    id: 'auto-balanced',
    name: 'Auto (Balanced)',
    description: 'Good balance of speed and quality',
    tier: 'balanced' as ModelTier,
  },
  'auto-premium': {
    id: 'auto-premium',
    name: 'Auto (Premium)',
    description: 'Best quality, reasoning models',
    tier: 'premium' as ModelTier,
  },
} as const;

// State interface
interface ChatState {
  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;

  // Messages
  messages: Message[];

  // UI State
  isStreaming: boolean;
  isLoading: boolean;
  error: string | null;

  // Model selection
  selectedModel: string;
  selectedModelTier: ModelTier;

  // Draft content for input persistence
  draftContent: string;

  // Sidebar state
  sidebarCollapsed: boolean;

  // Actions - Conversations
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  deleteConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;

  // Actions - Messages
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  appendToMessage: (id: string, content: string) => void;
  deleteMessage: (id: string) => void;
  clearMessages: () => void;

  // Actions - Streaming
  startStreaming: (messageId: string) => void;
  stopStreaming: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Actions - Model
  setSelectedModel: (modelId: string, tier: ModelTier) => void;

  // Actions - Draft
  setDraftContent: (content: string) => void;

  // Actions - Sidebar
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Utility
  reset: () => void;
}

const initialState = {
  conversations: [],
  activeConversationId: null,
  messages: [],
  isStreaming: false,
  isLoading: false,
  error: null,
  selectedModel: 'auto-balanced',
  selectedModelTier: 'balanced' as ModelTier,
  draftContent: '',
  sidebarCollapsed: false,
};

export const useChatStore = create<ChatState>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        // Conversations
        setConversations: (conversations) =>
          set({ conversations }, undefined, 'chat/setConversations'),

        addConversation: (conversation) =>
          set(
            (state) => ({
              conversations: [conversation, ...state.conversations],
            }),
            undefined,
            'chat/addConversation',
          ),

        updateConversation: (id, updates) =>
          set(
            (state) => ({
              conversations: state.conversations.map((c) =>
                c.id === id ? { ...c, ...updates } : c,
              ),
            }),
            undefined,
            'chat/updateConversation',
          ),

        deleteConversation: (id) =>
          set(
            (state) => ({
              conversations: state.conversations.filter((c) => c.id !== id),
              activeConversationId:
                state.activeConversationId === id ? null : state.activeConversationId,
              messages: state.activeConversationId === id ? [] : state.messages,
            }),
            undefined,
            'chat/deleteConversation',
          ),

        setActiveConversation: (id) =>
          set(
            {
              activeConversationId: id,
              messages: [], // Clear messages when switching conversations
              error: null,
            },
            undefined,
            'chat/setActiveConversation',
          ),

        // Messages
        setMessages: (messages) => set({ messages }, undefined, 'chat/setMessages'),

        addMessage: (message) =>
          set(
            (state) => ({
              messages: [...state.messages, message],
            }),
            undefined,
            'chat/addMessage',
          ),

        updateMessage: (id, updates) =>
          set(
            (state) => ({
              messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
            }),
            undefined,
            'chat/updateMessage',
          ),

        appendToMessage: (id, content) =>
          set(
            (state) => ({
              messages: state.messages.map((m) =>
                m.id === id ? { ...m, content: m.content + content } : m,
              ),
            }),
            undefined,
            'chat/appendToMessage',
          ),

        deleteMessage: (id) =>
          set(
            (state) => ({
              messages: state.messages.filter((m) => m.id !== id),
            }),
            undefined,
            'chat/deleteMessage',
          ),

        clearMessages: () => set({ messages: [] }, undefined, 'chat/clearMessages'),

        // Streaming
        startStreaming: (messageId) =>
          set(
            (state) => ({
              isStreaming: true,
              messages: state.messages.map((m) =>
                m.id === messageId ? { ...m, isStreaming: true } : m,
              ),
            }),
            undefined,
            'chat/startStreaming',
          ),

        stopStreaming: () =>
          set(
            (state) => ({
              isStreaming: false,
              messages: state.messages.map((m) => ({ ...m, isStreaming: false })),
            }),
            undefined,
            'chat/stopStreaming',
          ),

        setLoading: (loading) => set({ isLoading: loading }, undefined, 'chat/setLoading'),

        setError: (error) => set({ error }, undefined, 'chat/setError'),

        // Model
        setSelectedModel: (modelId, tier) =>
          set(
            { selectedModel: modelId, selectedModelTier: tier },
            undefined,
            'chat/setSelectedModel',
          ),

        // Draft
        setDraftContent: (content) =>
          set({ draftContent: content }, undefined, 'chat/setDraftContent'),

        // Sidebar
        toggleSidebar: () =>
          set(
            (state) => ({ sidebarCollapsed: !state.sidebarCollapsed }),
            undefined,
            'chat/toggleSidebar',
          ),

        setSidebarCollapsed: (collapsed) =>
          set({ sidebarCollapsed: collapsed }, undefined, 'chat/setSidebarCollapsed'),

        // Reset
        reset: () => set(initialState, undefined, 'chat/reset'),
      }),
      {
        name: 'agiworkforce-web-chat',
        storage: createJSONStorage(() => localStorage),
        version: 1,
        partialize: (state) => ({
          // Only persist model selection and sidebar state
          selectedModel: state.selectedModel,
          selectedModelTier: state.selectedModelTier,
          sidebarCollapsed: state.sidebarCollapsed,
        }),
      },
    ),
    { name: 'ChatStore', enabled: process.env.NODE_ENV === 'development' },
  ),
);

// Selectors for performance
export const selectMessages = (state: ChatState) => state.messages;
export const selectConversations = (state: ChatState) => state.conversations;
export const selectActiveConversationId = (state: ChatState) => state.activeConversationId;
export const selectIsStreaming = (state: ChatState) => state.isStreaming;
export const selectIsLoading = (state: ChatState) => state.isLoading;
export const selectSelectedModel = (state: ChatState) => state.selectedModel;
export const selectSelectedModelTier = (state: ChatState) => state.selectedModelTier;
export const selectError = (state: ChatState) => state.error;
export const selectSidebarCollapsed = (state: ChatState) => state.sidebarCollapsed;
