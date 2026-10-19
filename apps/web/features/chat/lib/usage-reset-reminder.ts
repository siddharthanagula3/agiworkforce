import {
  USAGE_RESET_REMINDER_PATH,
  type UsageResetReminderRequest,
} from '@agiworkforce/cloud-contracts';
import { enableWebPush } from '@/features/notifications';
import { addCsrfHeaders } from '@/lib/client/csrf';

export type UsageResetReminderOutcome = 'set' | 'blocked' | 'unavailable' | 'failed';

export const USAGE_RESET_REMINDER_COPY: Record<UsageResetReminderOutcome, string> = {
  set: 'We will notify you when it resets.',
  blocked: 'Notifications are blocked for this site in your browser settings.',
  unavailable: 'This browser cannot receive notifications.',
  failed: 'The reminder could not be set. Try again in a minute.',
};

export async function requestUsageResetReminder(
  resetAt: string,
): Promise<UsageResetReminderOutcome> {
  const push = await enableWebPush();
  if (push === 'denied') return 'blocked';
  if (push === 'unavailable') return 'unavailable';
  try {
    const response = await fetch(USAGE_RESET_REMINDER_PATH, {
      method: 'POST',
      credentials: 'include',
      headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ resetAt } satisfies UsageResetReminderRequest),
    });
    return response.ok ? 'set' : 'failed';
  } catch {
    return 'failed';
  }
}
