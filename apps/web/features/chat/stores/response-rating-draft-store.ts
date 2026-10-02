import { create } from 'zustand';
import type { ResponseRatingReason } from '@/app/api/feedback/response-rating-contract';

export interface ResponseRatingDraft {
  reason: ResponseRatingReason | null;
  comment: string;
  failure?: string;
}

export const EMPTY_RESPONSE_RATING_DRAFT: ResponseRatingDraft = { reason: null, comment: '' };

export function hasResponseRatingDetails(draft: ResponseRatingDraft | undefined): boolean {
  return draft !== undefined && (draft.reason !== null || draft.comment.trim().length > 0);
}

interface ResponseRatingDraftState {
  drafts: ReadonlyMap<string, ResponseRatingDraft>;
  openDraft: (messageId: string) => void;
  updateDraft: (messageId: string, draft: ResponseRatingDraft) => void;
  setDraftFailure: (messageId: string, failure: string | null) => void;
  closeDraft: (messageId: string) => void;
}

export const useResponseRatingDraftStore = create<ResponseRatingDraftState>()((set) => ({
  drafts: new Map(),

  openDraft: (messageId) =>
    set((state) => {
      const draft = state.drafts.get(messageId);
      return {
        drafts: new Map(state.drafts).set(
          messageId,
          draft ? { reason: draft.reason, comment: draft.comment } : EMPTY_RESPONSE_RATING_DRAFT,
        ),
      };
    }),

  updateDraft: (messageId, draft) =>
    set((state) =>
      state.drafts.has(messageId) ? { drafts: new Map(state.drafts).set(messageId, draft) } : state,
    ),

  setDraftFailure: (messageId, failure) =>
    set((state) => {
      const draft = state.drafts.get(messageId);
      if (!draft) return state;
      const details = { reason: draft.reason, comment: draft.comment };
      return {
        drafts: new Map(state.drafts).set(messageId, failure ? { ...details, failure } : details),
      };
    }),

  closeDraft: (messageId) =>
    set((state) => {
      if (!state.drafts.has(messageId)) return state;
      const drafts = new Map(state.drafts);
      drafts.delete(messageId);
      return { drafts };
    }),
}));
