import type { ToolApprovalStake } from './tool-approval-stakes';

export const DEVICE_HOST_HEADER = 'x-agi-device-host';

export const PHONE_STEP_TOOLS = [
  'device_calendar_events',
  'device_calendar_availability',
  'device_calendar_create_event',
  'device_reminder_create',
] as const;

export type PhoneStepTool = (typeof PHONE_STEP_TOOLS)[number];

export const PHONE_CAPABILITIES = ['calendar.read', 'calendar.write', 'reminders.write'] as const;

export type PhoneCapability = (typeof PHONE_CAPABILITIES)[number];

export const PHONE_STEP_CAPABILITY: Readonly<Record<PhoneStepTool, PhoneCapability>> = {
  device_calendar_events: 'calendar.read',
  device_calendar_availability: 'calendar.read',
  device_calendar_create_event: 'calendar.write',
  device_reminder_create: 'reminders.write',
};

export const PHONE_WRITE_STEP_TOOLS: readonly PhoneStepTool[] = [
  'device_calendar_create_event',
  'device_reminder_create',
];

export const MAX_PHONE_STEP_RANGE_DAYS = 62;
export const MAX_PHONE_STEP_TITLE_LENGTH = 200;
export const MAX_PHONE_STEP_LOCATION_LENGTH = 200;
export const MAX_PHONE_STEP_NOTES_LENGTH = 2_000;

export function isPhoneStepTool(name: string): name is PhoneStepTool {
  return (PHONE_STEP_TOOLS as readonly string[]).includes(name);
}

export function isPhoneCapability(value: string): value is PhoneCapability {
  return (PHONE_CAPABILITIES as readonly string[]).includes(value);
}

export function isPhoneWriteStep(name: string): boolean {
  return (PHONE_WRITE_STEP_TOOLS as readonly string[]).includes(name);
}

export function phoneStepNeedsConfirmation(name: string, input: unknown): boolean {
  if (isPhoneWriteStep(name)) return true;
  const review =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)['review']
      : undefined;
  return typeof review === 'string' && review.trim().length > 0;
}

export interface PhoneStepRequest {
  tool: PhoneStepTool;
  start?: string;
  end?: string;
  due?: string;
  title?: string;
  location?: string;
  notes?: string;
  allDay?: boolean;
}

export class PhoneStepRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhoneStepRefused';
  }
}

const PHONE_STEP_TIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

export function parsePhoneStepTime(value: string): Date | null {
  const match = PHONE_STEP_TIME.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, offset] = match;
  const date = offset
    ? new Date(value)
    : new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour ?? 0),
        Number(minute ?? 0),
        Number(second ?? 0),
      );
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatPhoneStepTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function readText(args: Record<string, unknown>, key: string, maxLength: number): string | null {
  const value = args[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new PhoneStepRefused(`"${key}" must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new PhoneStepRefused(`"${key}" must be at most ${maxLength} characters.`);
  }
  return trimmed || null;
}

function readTime(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !parsePhoneStepTime(value.trim())) {
    throw new PhoneStepRefused(
      `"${key}" must be a date and time like 2026-10-02T15:00, or a date like 2026-10-02.`,
    );
  }
  return value.trim();
}

function requireTime(args: Record<string, unknown>, key: string, tool: PhoneStepTool): string {
  const value = readTime(args, key);
  if (!value) throw new PhoneStepRefused(`${tool} needs "${key}".`);
  return value;
}

function assertOrdered(start: string, end: string): void {
  const from = parsePhoneStepTime(start)?.getTime() ?? 0;
  const to = parsePhoneStepTime(end)?.getTime() ?? 0;
  if (to <= from) throw new PhoneStepRefused('"end" must be after "start".');
}

export function planPhoneStep(tool: string, args: Record<string, unknown>): PhoneStepRequest {
  if (!isPhoneStepTool(tool)) throw new PhoneStepRefused(`"${tool}" is not a phone step.`);

  if (tool === 'device_calendar_events' || tool === 'device_calendar_availability') {
    const start = requireTime(args, 'start', tool);
    const end = requireTime(args, 'end', tool);
    assertOrdered(start, end);
    const days =
      ((parsePhoneStepTime(end)?.getTime() ?? 0) - (parsePhoneStepTime(start)?.getTime() ?? 0)) /
      86_400_000;
    if (days > MAX_PHONE_STEP_RANGE_DAYS) {
      throw new PhoneStepRefused(
        `A calendar read covers at most ${MAX_PHONE_STEP_RANGE_DAYS} days. Ask for a shorter range.`,
      );
    }
    return { tool, start, end };
  }

  const title = readText(args, 'title', MAX_PHONE_STEP_TITLE_LENGTH);
  if (!title) throw new PhoneStepRefused(`${tool} needs a "title".`);
  const notes = readText(args, 'notes', MAX_PHONE_STEP_NOTES_LENGTH);

  if (tool === 'device_reminder_create') {
    const due = readTime(args, 'due');
    return { tool, title, ...(due ? { due } : {}), ...(notes ? { notes } : {}) };
  }

  const allDay = args['allDay'] === true;
  const start = requireTime(args, 'start', tool);
  const end = readTime(args, 'end');
  if (!allDay && (!end || isDateOnly(start))) {
    throw new PhoneStepRefused(
      'A timed event needs "start" and "end" as dates and times. Set allDay for an all-day event.',
    );
  }
  if (end) assertOrdered(start, end);
  const location = readText(args, 'location', MAX_PHONE_STEP_LOCATION_LENGTH);
  return {
    tool,
    title,
    start,
    ...(end ? { end } : {}),
    ...(allDay ? { allDay: true } : {}),
    ...(location ? { location } : {}),
    ...(notes ? { notes } : {}),
  };
}

function spoken(value: string): string {
  return value.replace('T', ' ');
}

export function describePhoneStep(request: PhoneStepRequest): string {
  switch (request.tool) {
    case 'device_calendar_events':
      return `Read your calendar from ${spoken(request.start ?? '')} to ${spoken(request.end ?? '')}`;
    case 'device_calendar_availability':
      return `Check when you are free from ${spoken(request.start ?? '')} to ${spoken(request.end ?? '')}`;
    case 'device_calendar_create_event':
      return `Add "${request.title}" to your calendar on ${spoken(request.start ?? '')}`;
    case 'device_reminder_create':
      return request.due
        ? `Add the reminder "${request.title}" due ${spoken(request.due)}`
        : `Add the reminder "${request.title}"`;
  }
}

function readableTime(value: string, allDay: boolean): string {
  const date = parsePhoneStepTime(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(
    undefined,
    allDay || isDateOnly(value)
      ? { dateStyle: 'full' }
      : { dateStyle: 'medium', timeStyle: 'short' },
  ).format(date);
}

export function phoneStepStakes(
  toolName: string,
  args: Record<string, unknown>,
): ToolApprovalStake[] {
  let request: PhoneStepRequest;
  try {
    request = planPhoneStep(toolName, args);
  } catch {
    return [];
  }
  const allDay = request.allDay === true;
  const rows: Array<[string, string | undefined]> =
    request.tool === 'device_reminder_create'
      ? [
          ['Reminder', request.title],
          ['Due', request.due ? readableTime(request.due, false) : undefined],
          ['Notes', request.notes],
        ]
      : request.tool === 'device_calendar_create_event'
        ? [
            ['Event', request.title],
            [
              allDay ? 'Date' : 'Starts',
              request.start ? readableTime(request.start, allDay) : undefined,
            ],
            ['Ends', request.end && !allDay ? readableTime(request.end, false) : undefined],
            ['Where', request.location],
            ['Notes', request.notes],
          ]
        : [];
  return rows
    .filter((row): row is [string, string] => typeof row[1] === 'string' && row[1] !== '')
    .map(([label, value]) => ({ kind: 'item', label, value }));
}
