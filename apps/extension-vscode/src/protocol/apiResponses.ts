import { z } from 'zod';
import type { ManagedUsageSummaryResponse } from '@agiworkforce/types';

type UsageSummaryFieldsUsedByVsCode = Pick<
  ManagedUsageSummaryResponse,
  'plan_tier' | 'subscription_status' | 'usage_percentage' | 'usage_reset_at'
>;

const isoTimestamp = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'must be an ISO timestamp');

/**
 * `/api/usage` always serializes a full `ManagedUsageSummaryResponse`, so the
 * fields below carry the shared contract's constraints verbatim; the annotation
 * fails the build if either side drifts. The string length caps are the extra
 * bound this surface puts on untrusted network input, and the remaining summary
 * fields are passed through unread rather than required, so a contract addition
 * never blanks the plan badge.
 */
export const TierInfoSchema: z.ZodType<UsageSummaryFieldsUsedByVsCode> = z
  .object({
    plan_tier: z.string().min(1).max(64),
    subscription_status: z.string().min(1).max(64),
    usage_percentage: z.number().min(0).max(100),
    usage_reset_at: isoTimestamp.nullable(),
  })
  .passthrough();

export type TierInfoResponse = UsageSummaryFieldsUsedByVsCode;

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
