import { describe, expect, it } from 'vitest';
import { CHAT_ATTACHMENT_LIMITS, MAX_CHAT_ATTACHMENT_COUNT } from '@agiworkforce/cloud-contracts';
import {
  BILLING_PLAN_PRICING,
  getPlanMaxAttachmentBytes,
  getPlanMaxAttachmentsPerMessage,
  type BillingPlanTier,
} from '@agiworkforce/types';

import { composerAttachmentLimits } from '../composer-attachment-limits';

describe('composerAttachmentLimits', () => {
  it('uses the limits the server published', () => {
    const published = {
      maxFileBytes: 1_000,
      maxImageBytes: 500,
      maxMessageBytes: 4_000,
      maxFilesPerMessage: 4,
    };
    expect(composerAttachmentLimits(published, 'pro')).toBe(published);
  });

  it.each(Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[])(
    'holds the %s plan to the compiled policy when nothing was published',
    (tier) => {
      const limits = composerAttachmentLimits(null, tier);
      expect(limits.maxFilesPerMessage).toBe(
        Math.min(MAX_CHAT_ATTACHMENT_COUNT, getPlanMaxAttachmentsPerMessage(tier)),
      );
      expect(limits.maxFilesPerMessage).toBeLessThanOrEqual(MAX_CHAT_ATTACHMENT_COUNT);
      expect(limits.maxFileBytes).toBe(
        Math.min(CHAT_ATTACHMENT_LIMITS.maxFileBytes, getPlanMaxAttachmentBytes(tier)),
      );
      expect(limits.maxImageBytes).toBe(
        Math.min(CHAT_ATTACHMENT_LIMITS.maxImageBytes, getPlanMaxAttachmentBytes(tier)),
      );
      expect(limits.maxMessageBytes).toBe(CHAT_ATTACHMENT_LIMITS.maxMessageBytes);
    },
  );
});
