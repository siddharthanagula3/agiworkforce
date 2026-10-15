import { create } from 'zustand';

export interface ByokConversationRequest {
  sourceConversationId: string | null;
}

interface ByokRequestState {
  pending: ByokConversationRequest | null;
  request: (sourceConversationId: string | null) => void;
  close: () => void;
}

export const useByokRequestStore = create<ByokRequestState>()((set) => ({
  pending: null,
  request: (sourceConversationId) => set({ pending: { sourceConversationId } }),
  close: () => set({ pending: null }),
}));
