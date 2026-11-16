import { create } from 'zustand';

interface ComposerPrefillState {
  pending: Record<string, string>;
  prefill: (conversationId: string, text: string) => void;
  consume: (conversationId: string) => void;
}

export const useComposerPrefillStore = create<ComposerPrefillState>((set) => ({
  pending: {},
  prefill: (conversationId, text) =>
    set((state) => ({ pending: { ...state.pending, [conversationId]: text } })),
  consume: (conversationId) =>
    set((state) => {
      if (!(conversationId in state.pending)) return state;
      const { [conversationId]: _consumed, ...rest } = state.pending;
      return { pending: rest };
    }),
}));

export function prefillComposer(conversationId: string, text: string): void {
  if (!conversationId || text.length === 0) return;
  useComposerPrefillStore.getState().prefill(conversationId, text);
}

export function mergePrefill(current: string, prefill: string): string {
  return current.trim() ? `${current.replace(/\s+$/, '')}\n\n${prefill}` : prefill;
}
