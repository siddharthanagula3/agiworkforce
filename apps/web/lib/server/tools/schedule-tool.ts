import 'server-only';

import { z } from 'zod';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import {
  ScheduleConflictError,
  ScheduleLimitError,
  ScheduleValidationError,
  assertScheduleQuota,
  createSchedule,
  type ScheduleInput,
} from '@/lib/services/schedule-service';

export const CREATE_SCHEDULE_TOOL_NAME = 'create_schedule';

const DEFAULT_TIME_ZONE = 'UTC';
const MAX_NAME_CHARS = 120;
const MAX_PROMPT_CHARS = 4_000;
const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SCHEDULE_INTENT_RE =
  /\b(every\s+(day|morning|evening|night|week|weekday|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d+\s*(hours?|days?|weeks?))|each\s+(day|morning|week|month)|daily|weekly|monthly|remind me|reminder|schedule|recurring|tomorrow at|at \d{1,2}(:\d{2})?\s*(am|pm))\b/i;

export function isScheduleTool(name: string): boolean {
  return name === CREATE_SCHEDULE_TOOL_NAME;
}

export function asksForSchedule(message: string): boolean {
  return SCHEDULE_INTENT_RE.test(message);
}

export function scheduleToolDefinition() {
  return {
    type: 'function' as const,
    function: {
      name: CREATE_SCHEDULE_TOOL_NAME,
      description:
        'Create a scheduled task that runs a prompt on its own at a set time, once or on a repeating cadence, and appears in the Schedules screen. Use it when the user asks for something to happen later or regularly, such as a daily briefing or a weekly summary. Write the prompt as the full instruction the task should follow each run.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: MAX_NAME_CHARS, description: 'A short name.' },
          prompt: {
            type: 'string',
            maxLength: MAX_PROMPT_CHARS,
            description: 'What the task should do each time it runs.',
          },
          recurrence: {
            type: 'string',
            enum: ['once', 'daily', 'weekly', 'monthly'],
            description: 'How often it runs.',
          },
          scheduledAt: {
            type: 'string',
            description: 'For once: the ISO 8601 date and time to run, with its offset.',
          },
          timeOfDay: {
            type: 'string',
            description: 'For daily, weekly and monthly: the local time as HH:MM, 24-hour.',
          },
          daysOfWeek: {
            type: 'array',
            items: { type: 'integer', minimum: 0, maximum: 6 },
            description: 'For weekly: days to run, 0 for Sunday through 6 for Saturday.',
          },
          dayOfMonth: {
            type: 'integer',
            minimum: 1,
            maximum: 31,
            description: 'For monthly: the day of the month.',
          },
          timezone: {
            type: 'string',
            description: "IANA time zone, such as Europe/London. Defaults to the user's own.",
          },
        },
        required: ['name', 'prompt', 'recurrence'],
      },
    },
  };
}

const ScheduleArgs = z
  .object({
    name: z.string().trim().min(1).max(MAX_NAME_CHARS),
    prompt: z.string().trim().min(1).max(MAX_PROMPT_CHARS),
    recurrence: z.enum(['once', 'daily', 'weekly', 'monthly']),
    scheduledAt: z.string().trim().min(1).optional(),
    timeOfDay: z.string().regex(TIME_OF_DAY_RE).optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
  })
  .superRefine((value, context) => {
    const missing = (field: string) =>
      context.addIssue({ code: 'custom', message: `${field} is required`, path: [field] });
    if (value.recurrence === 'once' && !value.scheduledAt) missing('scheduledAt');
    if (value.recurrence !== 'once' && !value.timeOfDay) missing('timeOfDay');
    if (value.recurrence === 'weekly' && !value.daysOfWeek) missing('daysOfWeek');
    if (value.recurrence === 'monthly' && !value.dayOfMonth) missing('dayOfMonth');
  });

export interface ScheduleToolContext {
  db: DatabaseAdapter;
  userId: string;
  clientTimeZone?: string | undefined;
  temporaryChat: boolean;
}

function refused(message: string): { content: string; isError: boolean } {
  return { content: JSON.stringify({ created: false, reason: message }), isError: false };
}

export async function executeScheduleTool(
  args: Record<string, unknown>,
  context: ScheduleToolContext,
): Promise<{ content: string; isError: boolean }> {
  const parsed = ScheduleArgs.safeParse(args);
  if (!parsed.success) {
    return {
      content: `${CREATE_SCHEDULE_TOOL_NAME} was called with invalid arguments: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'input'} ${issue.message}`)
        .join('; ')}.`,
      isError: true,
    };
  }
  if (context.temporaryChat) {
    return refused('A temporary chat cannot create scheduled tasks.');
  }

  const input: ScheduleInput = {
    name: parsed.data.name,
    prompt: parsed.data.prompt,
    recurrence: parsed.data.recurrence,
    timezone: parsed.data.timezone ?? context.clientTimeZone ?? DEFAULT_TIME_ZONE,
    ...(parsed.data.scheduledAt ? { scheduledAt: parsed.data.scheduledAt } : {}),
    ...(parsed.data.timeOfDay ? { timeOfDay: parsed.data.timeOfDay } : {}),
    ...(parsed.data.daysOfWeek ? { daysOfWeek: parsed.data.daysOfWeek } : {}),
    ...(parsed.data.dayOfMonth ? { dayOfMonth: parsed.data.dayOfMonth } : {}),
  };

  try {
    const planTier = await resolveEntitledPlanTier(context.db, context.userId);
    const schedule = await context.db.transaction(async (tx) => {
      await tx.execute('select pg_advisory_xact_lock(hashtext($1))', [
        `scheduled_tasks:${context.userId}`,
      ]);
      await assertScheduleQuota(tx, context.userId, planTier);
      return createSchedule(tx, context.userId, input, { planTier });
    });
    return {
      content: JSON.stringify({
        created: true,
        id: schedule.id,
        name: schedule.name,
        timezone: input.timezone,
        nextRunAt: schedule.nextExecutionAt,
      }),
      isError: false,
    };
  } catch (error) {
    if (
      error instanceof ScheduleLimitError ||
      error instanceof ScheduleValidationError ||
      error instanceof ScheduleConflictError
    ) {
      return refused(error.message);
    }
    throw error;
  }
}
