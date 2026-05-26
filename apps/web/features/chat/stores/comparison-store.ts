/**
 * Comparison Store
 *
 * Tracks which A/B comparison option the user selected per message.
 * Web-only; kept separate from the shared unified-chat store to avoid
 * polluting the cross-surface package with web-specific metadata shapes.
 *
 * Key: `${conversationId}:${messageId}`
 * Value: 'a' | 'b'
 */
import { create } from 'zustand';

interface ComparisonState {
  choices: Record<string, 'a' | 'b'>;
  setComparisonChoice: (conversationId: string, messageId: string, choice: 'a' | 'b') => void;
  getComparisonChoice: (conversationId: string, messageId: string) => 'a' | 'b' | undefined;
}

export const useComparisonStore = create<ComparisonState>()((set, get) => ({
  choices: {},

  setComparisonChoice: (conversationId, messageId, choice) => {
    set((state) => ({
      choices: {
        ...state.choices,
        [`${conversationId}:${messageId}`]: choice,
      },
    }));
  },

  getComparisonChoice: (conversationId, messageId) => {
    return get().choices[`${conversationId}:${messageId}`];
  },
}));
