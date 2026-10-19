import 'server-only';

import { sleep } from 'workflow';

import { sendUsageResetReminderStep } from './steps/send-usage-reset-reminder';

export interface UsageResetReminderInput {
  userId: string;
  resetAt: string;
}

export async function usageResetReminderWorkflow(input: UsageResetReminderInput): Promise<void> {
  'use workflow';

  await sleep(new Date(input.resetAt));
  await sendUsageResetReminderStep(input.userId);
}
