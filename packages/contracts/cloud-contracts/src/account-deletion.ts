import { z } from 'zod';

export const MANAGED_CLOUD_ACCOUNT_DELETION_PATH = '/api/user/delete-account';
export const MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_PATH = '/api/user/delete-account/cancel';

export const MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH =
  '/api/user/delete-account/cancel-schedule';

export const AccountDeletionScheduleTimestampSchema = z.string().refine((value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?Z$/.exec(value);
  if (!match || match[0] !== value) return false;
  const [, y, m, d, h, min, sec] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= (days[month - 1] ?? 0) &&
    Number(h) < 24 &&
    Number(min) < 60 &&
    Number(sec) < 60
  );
}, 'Expected a finite UTC calendar timestamp with at most microsecond precision');

export const AccountDeletionScheduleCancellationRequestSchema = z
  .object({
    expectedSchedule: z
      .object({
        scheduledFor: AccountDeletionScheduleTimestampSchema,
        requestedAt: AccountDeletionScheduleTimestampSchema.nullable(),
      })
      .strict(),
  })
  .strict();

export type AccountDeletionScheduleCancellationRequest = z.infer<
  typeof AccountDeletionScheduleCancellationRequestSchema
>;

export const AccountDeletionStatusSchema = z
  .object({
    cancellationPrecondition: z.literal('schedule-pair-v1').optional(),
    pending: z.boolean(),
    canCancel: z.boolean(),
    requestedAt: z.string().datetime({ offset: true }).nullable(),
    scheduledFor: z.string().datetime({ offset: true }).nullable(),
  })
  .refine((status) => status.pending === (status.scheduledFor !== null))
  .refine((status) => !status.canCancel || status.pending)
  .refine(
    (status) =>
      status.cancellationPrecondition === undefined ||
      (status.pending &&
        AccountDeletionScheduleCancellationRequestSchema.safeParse({
          expectedSchedule: { scheduledFor: status.scheduledFor, requestedAt: status.requestedAt },
        }).success),
  );

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
  storeBilling: z
    .object({
      store: z.enum(['apple', 'google']),
      manageUrl: z.url({ protocol: /^https$/ }),
    })
    .optional(),
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
  planRenewal: z.enum(['restored', 'not_restored']).optional(),
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
