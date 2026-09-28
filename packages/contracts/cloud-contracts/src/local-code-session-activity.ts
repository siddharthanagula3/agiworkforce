import { z } from 'zod';
import { REMOTE_CODE_LIMITS } from '@agiworkforce/types';

export const LOCAL_CODE_SESSION_ACTIVITY_PATH = '/api/code/local-sessions/activity';

export const LOCAL_CODE_SESSION_ACTIVITY_EVENTS = [
  'approval_required',
  'completed',
  'failed',
] as const;

export type LocalCodeSessionActivityEvent = (typeof LOCAL_CODE_SESSION_ACTIVITY_EVENTS)[number];

const LocalCodeSessionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(REMOTE_CODE_LIMITS.idLength)
  .regex(/^[^\p{Cc}]+$/u);

export const LocalCodeSessionActivitySchema = z.object({
  event: z.enum(LOCAL_CODE_SESSION_ACTIVITY_EVENTS),
  rootId: LocalCodeSessionIdSchema,
  threadId: LocalCodeSessionIdSchema,
  turnId: LocalCodeSessionIdSchema,
  approvalId: LocalCodeSessionIdSchema.optional(),
  sessionTitle: z.string().trim().max(REMOTE_CODE_LIMITS.messageLength).nullable(),
});

export type LocalCodeSessionActivity = z.infer<typeof LocalCodeSessionActivitySchema>;

export function codeSessionActivityNotice(
  event: LocalCodeSessionActivityEvent,
  subject: string,
): { title: string; body: string } {
  switch (event) {
    case 'approval_required':
      return { title: 'Approval needed', body: `${subject} is waiting for your approval.` };
    case 'completed':
      return { title: 'Task finished', body: `${subject} finished its task.` };
    case 'failed':
      return { title: 'Task stopped', body: `${subject} stopped before it finished.` };
  }
}
