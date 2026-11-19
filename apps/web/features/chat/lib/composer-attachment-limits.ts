import { CHAT_ATTACHMENT_LIMITS, type ChatAttachmentLimits } from '@agiworkforce/cloud-contracts';
import {
  getPlanMaxAttachmentBytes,
  getPlanMaxAttachmentsPerMessage,
  type BillingPlanTier,
} from '@agiworkforce/types';

/**
 * The limits the server published for this account win. Before they arrive,
 * or from a server that does not publish them, the plan is held to the policy
 * this build carries, the same way the server derives what it publishes.
 */
export function composerAttachmentLimits(
  published: ChatAttachmentLimits | null | undefined,
  planTier: BillingPlanTier,
): ChatAttachmentLimits {
  if (published) return published;
  const planBytes = getPlanMaxAttachmentBytes(planTier);
  return {
    maxFileBytes: Math.min(CHAT_ATTACHMENT_LIMITS.maxFileBytes, planBytes),
    maxImageBytes: Math.min(CHAT_ATTACHMENT_LIMITS.maxImageBytes, planBytes),
    maxMessageBytes: CHAT_ATTACHMENT_LIMITS.maxMessageBytes,
    maxFilesPerMessage: Math.min(
      CHAT_ATTACHMENT_LIMITS.maxFilesPerMessage,
      getPlanMaxAttachmentsPerMessage(planTier),
    ),
  };
}
