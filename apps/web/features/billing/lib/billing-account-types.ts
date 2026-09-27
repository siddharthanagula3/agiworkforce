import { z } from 'zod';
import {
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  normalizeBillingPlanTier,
  type AutoReloadSettingsUpdate,
} from '@agiworkforce/types';
import { BillingIntervalSchema } from '@/lib/validations/checkout';

const PlanTierSchema = z.string().transform(normalizeBillingPlanTier);
const IsoDateSchema = z.string().min(1);

export const RecurringPriceSchema = z.object({
  amountCents: z.number().int().nonnegative(),
  currency: z.string().min(3),
  interval: BillingIntervalSchema,
});

export const ScheduledPlanChangeSchema = z.object({
  plan: PlanTierSchema,
  effectiveAt: IsoDateSchema,
  price: RecurringPriceSchema.nullable(),
});

export const DowngradeTargetSchema = z.object({
  plan: z.enum(SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER),
  price: RecurringPriceSchema,
});

export const DowngradeBlockSchema = z.enum([
  'pending_cancellation',
  'organization_plan',
  'lowest_plan',
]);

export const PlanChangeStateSchema = z.object({
  plan: PlanTierSchema,
  status: z.string(),
  price: RecurringPriceSchema.nullable(),
  periodEnd: IsoDateSchema.nullable(),
  trialStart: IsoDateSchema.nullable(),
  trialEnd: IsoDateSchema.nullable(),
  cancelAt: IsoDateSchema.nullable(),
  scheduledChange: ScheduledPlanChangeSchema.nullable(),
  downgradeTargets: z.array(DowngradeTargetSchema),
  downgradeBlock: DowngradeBlockSchema.nullable(),
});

export const TopUpReceiptSchema = z.object({
  id: z.string(),
  createdAt: IsoDateSchema,
  credits: z.number().nullable(),
  amountCents: z.number().int(),
  refundedCents: z.number().int(),
  currency: z.string().min(3),
  status: z.enum(['paid', 'processing', 'refunded', 'partially_refunded']),
  autoReload: z.boolean(),
  receiptUrl: z.string().url().nullable(),
});

export const BillingRefundSchema = z.object({
  id: z.string(),
  createdAt: IsoDateSchema,
  amountCents: z.number().int(),
  currency: z.string().min(3),
  status: z.enum(['processing', 'action_required', 'refunded', 'failed', 'canceled']),
  kind: z.enum(['top_up', 'plan']),
  credits: z.number().nullable(),
  paymentCreatedAt: IsoDateSchema,
  receiptUrl: z.string().url().nullable(),
});

export const AutoReloadSettingsSchema = z.object({
  enabled: z.boolean(),
  thresholdCredits: z.number().int().nonnegative(),
  amountUsd: z.number().int().positive(),
  paymentMethod: z.object({ brand: z.string(), last4: z.string() }).nullable(),
  lastFailure: z.object({ at: IsoDateSchema, reason: z.string() }).nullable(),
  consent: z.object({ version: z.string(), acceptedAt: IsoDateSchema }).nullable(),
});

export type AutoReloadSettings = z.infer<typeof AutoReloadSettingsSchema>;
export type AutoReloadUpdate = AutoReloadSettingsUpdate;
export type RecurringPrice = z.infer<typeof RecurringPriceSchema>;
export type ScheduledPlanChange = z.infer<typeof ScheduledPlanChangeSchema>;
export type DowngradeTarget = z.infer<typeof DowngradeTargetSchema>;
export type DowngradeBlock = z.infer<typeof DowngradeBlockSchema>;
export type PlanChangeState = z.infer<typeof PlanChangeStateSchema>;
export type TopUpReceipt = z.infer<typeof TopUpReceiptSchema>;
export type TopUpReceiptStatus = TopUpReceipt['status'];
export type BillingRefund = z.infer<typeof BillingRefundSchema>;
export type RefundStatus = BillingRefund['status'];
