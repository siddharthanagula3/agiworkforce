import { toUserMessage } from '@/lib/user-error-message';

export function scheduleErrorMessage(
  error: string | null | undefined,
  fallback = 'This run failed. Try it again or review the schedule settings.',
): string {
  return error ? toUserMessage(new Error(error), fallback) : fallback;
}
