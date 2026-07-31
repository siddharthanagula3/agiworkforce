import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

export const MAX_REMINDER_TITLE_LENGTH = 500;

export type ReminderCreationErrorCode =
  | 'invalid-input'
  | 'permission-denied'
  | 'unsupported-platform';

export class ReminderCreationError extends Error {
  constructor(
    public readonly code: ReminderCreationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReminderCreationError';
  }
}

export interface ReminderDue {
  dueDate: Date;
  allDay: boolean;
}

export interface CreateIOSReminderInput {
  title: string;
  due: ReminderDue | null;
}

function invalidInput(message: string): never {
  throw new ReminderCreationError('invalid-input', message);
}

function parseDateParts(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) invalidInput('Enter the date as YYYY-MM-DD.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    invalidInput('Enter a valid calendar date.');
  }
  return { year, month, day };
}

function parseTimeParts(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) invalidInput('Enter the time as HH:mm.');

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) invalidInput('Enter a valid 24-hour time.');
  return { hour, minute };
}

function localDayNumber(date: Date): number {
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
}

export function parseReminderDueInputs(
  rawDate: string,
  rawTime: string,
  now: Date = new Date(),
): ReminderDue | null {
  const dateInput = rawDate.trim();
  const timeInput = rawTime.trim();
  if (!dateInput && !timeInput) return null;
  if (!dateInput) invalidInput('Add a date before adding a time.');

  const { year, month, day } = parseDateParts(dateInput);
  if (!timeInput) {
    const dueDate = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (localDayNumber(dueDate) < localDayNumber(now)) {
      invalidInput('Choose today or a future date.');
    }
    return { dueDate, allDay: true };
  }

  const { hour, minute } = parseTimeParts(timeInput);
  const dueDate = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (dueDate.getTime() <= now.getTime()) invalidInput('Choose a future date and time.');
  return { dueDate, allDay: false };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function reminderDueInputsFromISO(value: string | undefined): {
  dateInput: string;
  timeInput: string;
} {
  if (!value) return { dateInput: '', timeInput: '' };
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { dateInput: '', timeInput: '' };
  return {
    dateInput: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    timeInput: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export async function createIOSReminder({ title, due }: CreateIOSReminderInput): Promise<string> {
  if (Platform.OS !== 'ios') {
    throw new ReminderCreationError(
      'unsupported-platform',
      'Apple Reminders integration is available only on iOS.',
    );
  }

  const normalizedTitle = title.trim();
  if (!normalizedTitle) invalidInput('Add a reminder title.');
  if (normalizedTitle.length > MAX_REMINDER_TITLE_LENGTH) {
    invalidInput(`Keep the reminder title under ${MAX_REMINDER_TITLE_LENGTH} characters.`);
  }

  let permission = await Calendar.getRemindersPermissionsAsync();
  if (permission.status !== 'granted' && permission.canAskAgain !== false) {
    permission = await Calendar.requestRemindersPermissionsAsync();
  }
  if (permission.status !== 'granted') {
    throw new ReminderCreationError(
      'permission-denied',
      'Allow Reminders access in Settings to create this reminder.',
    );
  }

  return Calendar.createReminderAsync(null, {
    title: normalizedTitle,
    ...(due
      ? {
          dueDate: due.dueDate,
          allDay: due.allDay,
          ...(due.allDay ? {} : { alarms: [{ absoluteDate: due.dueDate.toISOString() }] }),
        }
      : {}),
  });
}
