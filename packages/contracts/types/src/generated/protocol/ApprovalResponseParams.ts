import type { ReviewDecision } from './ReviewDecision';

export type ApprovalResponseParams = {
  threadId: string;
  turnId: string;
  requestId: string;
  decision: ReviewDecision;
};
