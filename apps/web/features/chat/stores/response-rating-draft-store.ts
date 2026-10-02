import { create } from 'zustand';
import type { ResponseRatingReason } from '@/app/api/feedback/response-rating-contract';

export interface ResponseRatingDraft {
  reason: ResponseRatingReason | null;
  comment: string;
}

export const EMPTY_RESPONSE_RATING_DRAFT: ResponseRatingDraft = { reason: null, comment: '' };

interface ResponseRatingDraftState {
  drafts: ReadonlyMap<string, ResponseRatingDraft>;
  openDraft: (messageId: string) => void;
  updateDraft: (messageId: string, draft: ResponseRatingDraft) => void;
  closeDraft: (messageId: string) => void;
}

export const useResponseRatingDraftStore = create<ResponseRatingDraftState>()((set) => ({
  drafts: new Map(),

  openDraft: (messageId) =>
    set((state) => ({
      drafts: new Map(state.drafts).set(messageId, EMPTY_RESPONSE_RATING_DRAFT),
    })),

  updateDraft: (messageId, draft) =>
    set((state) =>
      state.drafts.has(messageId) ? { drafts: new Map(state.drafts).set(messageId, draft) } : state,
    ),

  closeDraft: (messageId) =>
    set((state) => {
      if (!state.drafts.has(messageId)) return state;
      const drafts = new Map(state.drafts);
      drafts.delete(messageId);
      return { drafts };
    }),
}));
