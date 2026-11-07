import { z } from 'zod';

export const MANAGED_CLOUD_ACCOUNT_DELETION_PATH = '/api/user/delete-account';
export const MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_PATH = '/api/user/delete-account/cancel';

export const AccountDeletionStatusSchema = z
  .object({
    pending: z.boolean(),
    canCancel: z.boolean(),
    requestedAt: z.string().datetime({ offset: true }).nullable(),
    scheduledFor: z.string().datetime({ offset: true }).nullable(),
  })
  .refine((status) => status.pending === (status.scheduledFor !== null))
  .refine((status) => !status.canCancel || status.pending);

export type AccountDeletionStatus = z.infer<typeof AccountDeletionStatusSchema>;

export const NO_PENDING_ACCOUNT_DELETION: AccountDeletionStatus = {
  pending: false,
  canCancel: false,
  requestedAt: null,
  scheduledFor: null,
};

export function parseAccountDeletionStatus(value: unknown): AccountDeletionStatus {
  return AccountDeletionStatusSchema.parse(value);
}

export const AccountDeletionScheduleReceiptSchema = z.object({
  message: z.string().trim().min(1),
  scheduledFor: z.string().datetime({ offset: true }),
  status: z.literal('pending'),
  statusReason: z.string().trim().min(1),
  error: z.never().optional(),
  reason: z.never().optional(),
});

export type AccountDeletionScheduleReceipt = z.infer<typeof AccountDeletionScheduleReceiptSchema>;

export function parseAccountDeletionScheduleReceipt(
  value: unknown,
): AccountDeletionScheduleReceipt {
  return AccountDeletionScheduleReceiptSchema.parse(value);
}

export const AccountDeletionCancellationReceiptSchema = z.object({
  message: z.string().trim().min(1),
  cancelled: z.boolean(),
  error: z.never().optional(),
  reason: z.never().optional(),
});

export type AccountDeletionCancellationReceipt = z.infer<
  typeof AccountDeletionCancellationReceiptSchema
>;

export function parseAccountDeletionCancellationReceipt(
  value: unknown,
): AccountDeletionCancellationReceipt {
  return AccountDeletionCancellationReceiptSchema.parse(value);
}
