import {
  assertDeliverableCadence,
  buildCronExpression,
  describeSweepCadence,
  SWEEP_INTERVAL_MS,
  validateTimeZone,
  type ProductRecurrence,
} from '@/lib/schedules/schedule-time';
import type {
  IntervalUnit,
  ScheduleDraft,
  ScheduleFormErrors,
  ScheduleMutation,
  ScheduleTask,
} from '../types';
import { taskRecurrence } from '../types';

const MIN_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 365 * 24 * 60 * 60 * 1_000;
const UNIT_MS: Record<IntervalUnit, number> = {
  minutes: 60_000,
  hours: 60 * 60_000,
  days: 24 * 60 * 60_000,
};

export const INITIAL_SCHEDULE_DRAFT: ScheduleDraft = {
  name: '',
  description: '',
  prompt: '',
  model: 'auto',
  // On-demand/manual is the safer default: a fresh dialog should not pre-load
  // as a standing weekday-9am recurring automation the user has to notice and
  // change. Matches Claude's Frequency default (sched-gap-17).
  recurrence: 'once',
  cronExpression: '',
  scheduledLocal: '',
  intervalValue: '1',
  intervalUnit: 'days',
  timeOfDay: '09:00',
  daysOfWeek: [1, 2, 3, 4, 5],
  dayOfMonth: 1,
  timezone: 'UTC',
  isActive: true,
  expiresLocal: '',
  maxExecutions: '',
  projectId: null,
};

export function createInitialScheduleDraft(): ScheduleDraft {
  let timezone = 'UTC';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    validateTimeZone(timezone);
  } catch {
    timezone = 'UTC';
  }
  return {
    ...INITIAL_SCHEDULE_DRAFT,
    daysOfWeek: [...INITIAL_SCHEDULE_DRAFT.daysOfWeek],
    timezone,
  };
}

interface WallClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function parseLocalInput(value: string): WallClockParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Enter a complete local date and time.');
  const parts: WallClockParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const normalized = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute),
  );
  if (
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.hour > 23 ||
    parts.minute > 59 ||
    normalized.getUTCFullYear() !== parts.year ||
    normalized.getUTCMonth() + 1 !== parts.month ||
    normalized.getUTCDate() !== parts.day
  ) {
    throw new Error('Enter a valid local date and time.');
  }
  return parts;
}

function formatterFor(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: validateTimeZone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

function partsAt(formatter: Intl.DateTimeFormat, instant: Date): WallClockParts {
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values['year']!,
    month: values['month']!,
    day: values['day']!,
    hour: values['hour']!,
    minute: values['minute']!,
  };
}

function sameWallClock(left: WallClockParts, right: WallClockParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

/**
 * Converts a datetime-local value to an instant without relying on the browser
 * or server's own timezone. DST gaps and repeated wall-clock minutes are
 * rejected so a user never schedules a different instant than the one shown.
 */
export function zonedLocalInputToIso(value: string, timezone: string): string {
  const target = parseLocalInput(value);
  const formatter = formatterFor(timezone);
  const naiveUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  const offsets = new Set<number>();

  // Sampling both sides of the requested wall time discovers each offset used
  // around a DST boundary without assuming a one-hour transition.
  for (let hours = -48; hours <= 48; hours += 6) {
    const sampleMs = naiveUtc + hours * 60 * 60_000;
    const sample = new Date(sampleMs);
    const local = partsAt(formatter, sample);
    const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    offsets.add(localAsUtc - sampleMs);
  }

  const candidates = [...offsets]
    .map((offset) => new Date(naiveUtc - offset))
    .filter((candidate) => sameWallClock(partsAt(formatter, candidate), target))
    .map((candidate) => candidate.toISOString())
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .sort();

  if (candidates.length === 0) {
    throw new Error(
      'This local time does not exist because the clock changes for daylight saving.',
    );
  }
  if (candidates.length > 1) {
    throw new Error('This local time occurs twice because the clock changes for daylight saving.');
  }
  return candidates[0]!;
}

export function isoToZonedLocalInput(value: string | null, timezone: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = partsAt(formatterFor(timezone), date);
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function intervalFields(
  intervalMs: number | null,
): Pick<ScheduleDraft, 'intervalValue' | 'intervalUnit'> {
  if (!intervalMs || intervalMs < MIN_INTERVAL_MS)
    return { intervalValue: '1', intervalUnit: 'days' };
  if (intervalMs % UNIT_MS.days === 0) {
    return { intervalValue: String(intervalMs / UNIT_MS.days), intervalUnit: 'days' };
  }
  if (intervalMs % UNIT_MS.hours === 0) {
    return { intervalValue: String(intervalMs / UNIT_MS.hours), intervalUnit: 'hours' };
  }
  return { intervalValue: String(intervalMs / UNIT_MS.minutes), intervalUnit: 'minutes' };
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isInteger(item))
    : [];
}

export function scheduleToDraft(task: ScheduleTask): ScheduleDraft {
  const recurrence = taskRecurrence(task);
  const metadata = task.metadata ?? {};
  const interval = intervalFields(task.intervalMs);
  const storedTime = metadata['timeOfDay'];
  const storedDay = metadata['dayOfMonth'];
  return {
    name: task.name,
    description: task.description ?? '',
    prompt: task.prompt ?? '',
    model: task.model ?? 'auto',
    recurrence,
    cronExpression: task.cronExpression ?? '',
    scheduledLocal: isoToZonedLocalInput(task.executeAt, task.timezone),
    ...interval,
    timeOfDay: typeof storedTime === 'string' ? storedTime : '09:00',
    daysOfWeek: numberArray(metadata['daysOfWeek']),
    dayOfMonth: typeof storedDay === 'number' && Number.isInteger(storedDay) ? storedDay : 1,
    timezone: task.timezone,
    isActive: task.isEnabled,
    expiresLocal: isoToZonedLocalInput(task.expiresAt, task.timezone),
    maxExecutions: task.maxExecutions === null ? '' : String(task.maxExecutions),
    projectId: task.projectId ?? null,
  };
}

const DERIVED_NAME_MAX_LENGTH = 60;

/**
 * sched-gap-08: `name` was a required free-text field with nothing to fall back
 * on, so every schedule started with a chore that has one obvious answer. The
 * task's own instructions are the content to derive from, the same first-line
 * truncation the conversation titler uses as its stage-1 title, kept on the
 * client because a schedule is created before any model runs.
 */
export function deriveScheduleName(prompt: string): string {
  const firstLine = prompt.split('\n').find((line) => line.trim()) ?? '';
  const collapsed = firstLine.trim().replace(/\s+/g, ' ');
  if (collapsed.length <= DERIVED_NAME_MAX_LENGTH) return collapsed;
  const cut = collapsed.slice(0, DERIVED_NAME_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > DERIVED_NAME_MAX_LENGTH / 3 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function addError(errors: ScheduleFormErrors, field: keyof ScheduleFormErrors, message: string) {
  if (!errors[field]) errors[field] = message;
}

export type ScheduleValidationResult =
  | { ok: true; payload: ScheduleMutation }
  | { ok: false; errors: ScheduleFormErrors };

interface ScheduleValidationOptions {
  /**
   * A stored sub-daily interval created before the deployed cadence floor.
   * It may survive an unrelated edit, but cannot be changed to another
   * unsupported cadence.
   */
  existingIntervalMs?: number | null;
}

export function validateAndBuildScheduleRequest(
  draft: ScheduleDraft,
  now = new Date(),
  options: ScheduleValidationOptions = {},
): ScheduleValidationResult {
  const errors: ScheduleFormErrors = {};
  const description = draft.description.trim();
  const prompt = draft.prompt.trim();
  const model = draft.model.trim();
  const name = draft.name.trim() || deriveScheduleName(prompt);

  if (!name) addError(errors, 'name', 'Enter a schedule name.');
  else if (name.length > 500) addError(errors, 'name', 'Use 500 characters or fewer.');
  if (description.length > 2_000) {
    addError(errors, 'description', 'Use 2,000 characters or fewer.');
  }
  if (!prompt) addError(errors, 'prompt', 'Enter instructions for the scheduled task.');
  else if (prompt.length > 10_000) addError(errors, 'prompt', 'Use 10,000 characters or fewer.');
  if (!model) addError(errors, 'model', 'Select a model or Auto mode.');

  try {
    validateTimeZone(draft.timezone);
  } catch {
    addError(errors, 'timezone', 'Enter a valid IANA time zone.');
  }

  let scheduledAt: string | null = null;
  let expiresAt: string | null = null;
  let intervalMs: number | null = null;
  let cronExpression: string | null = null;
  const timeOfDay = draft.timeOfDay;
  const daysOfWeek = [...new Set(draft.daysOfWeek)].sort((a, b) => a - b);

  if (!errors.timezone && draft.expiresLocal) {
    try {
      expiresAt = zonedLocalInputToIso(draft.expiresLocal, draft.timezone);
      if (new Date(expiresAt) <= now)
        addError(errors, 'expiresLocal', 'Choose a future expiration.');
    } catch (error) {
      addError(
        errors,
        'expiresLocal',
        error instanceof Error ? error.message : 'Enter a valid expiration.',
      );
    }
  }

  if (draft.recurrence === 'once') {
    if (!draft.scheduledLocal) {
      addError(errors, 'scheduledLocal', 'Choose when this task should run.');
    } else if (!errors.timezone) {
      try {
        scheduledAt = zonedLocalInputToIso(draft.scheduledLocal, draft.timezone);
        if (new Date(scheduledAt) <= now) {
          addError(errors, 'scheduledLocal', 'Choose a time in the future.');
        }
      } catch (error) {
        addError(
          errors,
          'scheduledLocal',
          error instanceof Error ? error.message : 'Enter a valid date and time.',
        );
      }
    }
  } else if (draft.recurrence === 'interval') {
    const intervalValue = Number(draft.intervalValue);
    intervalMs = intervalValue * UNIT_MS[draft.intervalUnit];
    const unchangedLegacyInterval =
      typeof options.existingIntervalMs === 'number' &&
      options.existingIntervalMs < SWEEP_INTERVAL_MS &&
      intervalMs === options.existingIntervalMs;
    if (
      !Number.isInteger(intervalValue) ||
      intervalValue <= 0 ||
      !Number.isSafeInteger(intervalMs) ||
      (intervalMs < SWEEP_INTERVAL_MS && !unchangedLegacyInterval) ||
      intervalMs > MAX_INTERVAL_MS
    ) {
      // Lower bound is the deployed sweep, not a fixed "1 day", the message is
      // derived so it cannot keep naming a floor the platform no longer enforces.
      addError(
        errors,
        'intervalValue',
        `Use an interval from ${describeSweepCadence().minimum} to 365 days.`,
      );
    }
  } else {
    try {
      cronExpression =
        draft.recurrence === 'custom'
          ? buildCronExpression({
              recurrence: 'custom',
              cronExpression: draft.cronExpression,
            })
          : buildCronExpression({
              recurrence: draft.recurrence,
              timeOfDay,
              daysOfWeek,
              dayOfMonth: draft.dayOfMonth,
            });
      // Agree with the server's cadence floor here rather than letting the user
      // submit and receive a 400 they had no way to anticipate.
      assertDeliverableCadence(
        { scheduleType: 'cron', cronExpression, timezone: draft.timezone },
        new Date(),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Enter a valid schedule.';
      if (draft.recurrence === 'weekly' && daysOfWeek.length === 0) {
        addError(errors, 'daysOfWeek', 'Select at least one day.');
      } else if (draft.recurrence === 'monthly') {
        addError(errors, 'dayOfMonth', message);
      } else if (draft.recurrence === 'custom') {
        addError(errors, 'cronExpression', message);
      } else {
        addError(errors, 'timeOfDay', message);
      }
    }
  }

  let maxExecutions: number | null = null;
  if (draft.maxExecutions.trim()) {
    maxExecutions = Number(draft.maxExecutions);
    if (!Number.isInteger(maxExecutions) || maxExecutions < 1 || maxExecutions > 1_000_000) {
      addError(errors, 'maxExecutions', 'Use a whole number from 1 to 1,000,000.');
    }
  }

  if (scheduledAt && expiresAt && new Date(expiresAt) <= new Date(scheduledAt)) {
    addError(errors, 'expiresLocal', 'Expiration must be after the scheduled run.');
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    payload: {
      name,
      description: description || null,
      prompt,
      model,
      recurrence: draft.recurrence,
      cronExpression: draft.recurrence === 'custom' ? cronExpression : null,
      scheduledAt,
      intervalMs,
      timeOfDay,
      daysOfWeek,
      dayOfMonth: draft.recurrence === 'monthly' ? draft.dayOfMonth : null,
      timezone: draft.timezone,
      isActive: draft.isActive,
      expiresAt,
      maxExecutions,
      projectId: draft.projectId,
    },
  };
}

export function recurrenceFromTask(task: ScheduleTask): ProductRecurrence {
  return taskRecurrence(task);
}
