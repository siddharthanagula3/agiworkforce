import { z } from 'zod';

export const USAGE_RESET_REMINDER_PATH = '/api/usage/reset-reminder';

/** A reminder is only taken for a reset within the longest usage window, a week. */
export const USAGE_RESET_REMINDER_MAX_AHEAD_MS = 8 * 24 * 60 * 60 * 1000;

export const UsageResetReminderRequestSchema = z.object({
  resetAt: z.string().datetime(),
});

export type UsageResetReminderRequest = z.infer<typeof UsageResetReminderRequestSchema>;

export const UsageResetReminderResponseSchema = z.object({
  remindAt: z.string().datetime(),
});

export type UsageResetReminderResponse = z.infer<typeof UsageResetReminderResponseSchema>;
