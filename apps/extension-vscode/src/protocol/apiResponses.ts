import { z } from 'zod';
import type {
  ManagedUsageCreditWindow,
  ManagedUsageCredits,
  ManagedUsageSummaryResponse,
} from '@agiworkforce/types';

type UsageSummaryFieldsUsedByVsCode = Pick<
  ManagedUsageSummaryResponse,
  'plan_tier' | 'subscription_status' | 'usage_percentage' | 'usage_reset_at'
> & {
  [
    K in
      | 'has_usage_remaining'
      | 'session_usage_percentage'
      | 'session_reset_at'
      | 'weekly_usage_percentage'
      | 'weekly_reset_at'
      | 'flagship_weekly_usage_percentage'
      | 'flagship_weekly_reset_at'
      | 'credit_balance_cents'
      | 'overage_enabled'
      | 'credits'
  ]?: ManagedUsageSummaryResponse[K] | undefined;
};

const isoTimestamp = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'must be an ISO timestamp');

const usagePercentage = z.number().min(0).max(100);

const creditAmount = z.number().nonnegative();

const ManagedUsageCreditWindowSchema: z.ZodType<ManagedUsageCreditWindow> = z.object({
  allowance: creditAmount,
  used: creditAmount,
  remaining: creditAmount,
  reset_at: isoTimestamp.nullable(),
});

const ManagedUsageCreditsSchema: z.ZodType<ManagedUsageCredits> = z.object({
  monthly: ManagedUsageCreditWindowSchema,
  weekly: ManagedUsageCreditWindowSchema,
  five_hour: ManagedUsageCreditWindowSchema,
  flagship_weekly: ManagedUsageCreditWindowSchema.nullable(),
  purchased: z.object({
    remaining: creditAmount.nullable(),
    overage_enabled: z.boolean(),
  }),
});

/**
 * `/api/usage` always serializes a full `ManagedUsageSummaryResponse`, so the
 * fields below carry the shared contract's constraints verbatim; the annotation
 * fails the build if either side drifts. The string length caps are the extra
 * bound this surface puts on untrusted network input, and the remaining summary
 * fields are passed through unread rather than required, so a contract addition
 * never blanks the plan badge. The rolling-window fields stay optional so an
 * older deployment still renders the billing-period meter instead of nothing.
 */
export const TierInfoSchema: z.ZodType<UsageSummaryFieldsUsedByVsCode> = z
  .object({
    plan_tier: z.string().min(1).max(64),
    subscription_status: z.string().min(1).max(64),
    usage_percentage: usagePercentage,
    usage_reset_at: isoTimestamp.nullable(),
    has_usage_remaining: z.boolean().optional(),
    session_usage_percentage: usagePercentage.optional(),
    session_reset_at: isoTimestamp.nullable().optional(),
    weekly_usage_percentage: usagePercentage.optional(),
    weekly_reset_at: isoTimestamp.nullable().optional(),
    flagship_weekly_usage_percentage: usagePercentage.optional(),
    flagship_weekly_reset_at: isoTimestamp.nullable().optional(),
    credit_balance_cents: z.number().int().nonnegative().nullable().optional(),
    overage_enabled: z.boolean().optional(),
    credits: ManagedUsageCreditsSchema.optional().catch(undefined),
  })
  .passthrough();

export type TierInfoResponse = UsageSummaryFieldsUsedByVsCode;

const requestCount = z.number().int().nonnegative();

const UsageHistoryBreakdownRowSchema = z.object({
  key: z.string().min(1).max(200),
  label: z.string().max(200).nullable().optional(),
  requests: requestCount,
  credits: creditAmount,
});

export const UsageHistorySchema = z.object({
  from: isoTimestamp,
  to: isoTimestamp,
  granularity: z.enum(['day', 'week', 'month']),
  totals: z.object({ requests: requestCount, credits: creditAmount }),
  periods: z
    .array(z.object({ start: isoTimestamp, requests: requestCount, credits: creditAmount }))
    .max(400),
  byWorkload: z.array(UsageHistoryBreakdownRowSchema).max(50),
  byModel: z.array(UsageHistoryBreakdownRowSchema).max(50),
  freshness: z.object({ unsettledRequests: requestCount }),
});

export type UsageHistory = z.infer<typeof UsageHistorySchema>;

export const TurnSettlementSchema = z.object({
  requestId: z.string().min(1).max(200),
  status: z.enum(['settled', 'pending']),
  credits: z.number().nonnegative().nullable(),
});

export type TurnSettlement = z.infer<typeof TurnSettlementSchema>;

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
