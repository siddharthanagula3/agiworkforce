
import { z } from 'zod';

export const TierInfoSchema = z
  .object({
    plan_tier: z.string().min(1).max(64),
    subscription_status: z.string().min(1).max(64),
    usage_percentage: z.number().min(0).max(100).optional(),
    usage_reset_at: z.string().min(1).nullable().optional(),
  })
  .passthrough();

export type TierInfoResponse = z.infer<typeof TierInfoSchema>;

export const PaywallPayloadSchema = z.object({
  kind: z.literal('paywall'),
  feature: z.string().min(1).max(200),
  requiredTier: z.string().min(1).max(64),
  reason: z.string().min(1).max(500),
});

export type PaywallPayload = z.infer<typeof PaywallPayloadSchema>;

export const ChatCompletionChunkSchema = z
  .object({
    id: z.string().optional(),
    object: z.string().optional(),
    created: z.number().optional(),
    model: z.string().optional(),
    choices: z
      .array(
        z
          .object({
            index: z.number().int().optional(),
            delta: z
              .object({
                role: z.string().optional(),
                content: z.string().optional(),
              })
              .passthrough()
              .optional(),
            finish_reason: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export type ChatCompletionChunk = z.infer<typeof ChatCompletionChunkSchema>;
