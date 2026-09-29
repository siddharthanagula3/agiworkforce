import { z } from 'zod';

export const MANAGED_CLOUD_ACCOUNT_DELETION_PATH = '/api/user/delete-account';
export const MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_PATH = '/api/user/delete-account/cancel';

export const AccountDeletionStatusSchema = z
  .object({
    pending: z.boolean(),
    canCancel: z.boolean(),
    requestedAt: z.string().nullable(),
    scheduledFor: z.string().nullable(),
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
