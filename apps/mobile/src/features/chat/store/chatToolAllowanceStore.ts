import { create } from 'zustand';

interface ChatToolAllowanceState {
  allowedByConversation: Readonly<Record<string, readonly string[]>>;
  allowForChat: (conversationId: string, toolName: string) => void;
}

export const useChatToolAllowanceStore = create<ChatToolAllowanceState>()((set) => ({
  allowedByConversation: {},
  allowForChat: (conversationId, toolName) =>
    set((state) => {
      const allowed = state.allowedByConversation[conversationId] ?? [];
      if (allowed.includes(toolName)) return state;
      return {
        allowedByConversation: {
          ...state.allowedByConversation,
          [conversationId]: [...allowed, toolName],
        },
      };
    }),
}));

const NONE: readonly string[] = [];

export function useToolsAllowedForChat(conversationId: string | undefined) {
  return useChatToolAllowanceStore((state) =>
    conversationId ? (state.allowedByConversation[conversationId] ?? NONE) : NONE,
  );
}
