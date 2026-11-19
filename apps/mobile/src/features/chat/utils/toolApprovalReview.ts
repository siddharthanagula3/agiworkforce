import { readToolApprovalReview, type ToolApprovalReview } from '@agiworkforce/cloud-contracts';
import type { ToolCall } from '@/types/chat';

export function recordToolApprovalReview(tool: ToolCall, wire: unknown): void {
  const review = readToolApprovalReview(wire);
  if (review) tool.approvalReview = review;
}

export function toolCallApprovalReview(tool: ToolCall): ToolApprovalReview | undefined {
  const review = tool.approvalReview;
  if (!review) return undefined;
  return readToolApprovalReview({
    risk_tier: review.riskTier,
    destructive: review.destructive,
    approval_scopes: review.scopes,
  });
}
