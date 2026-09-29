import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar/legacy';
import { MAX_DEVICE_STEP_OUTPUT_LENGTH } from '@agiworkforce/cloud-contracts';
import {
  PhoneStepRefused,
  formatPhoneStepTime,
  isPhoneStepTool,
  parsePhoneStepTime,
  planPhoneStep,
  type PhoneStepRequest,
} from '@agiworkforce/types';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { getDeviceId } from '@/lib/deviceId';

export interface PhoneDeviceStep {
  toolCallId: string;
  name: string;
  deviceId: string;
  input: Record<string, unknown>;
}

export interface PhoneStepOutcome {
  content: string;
  isError: boolean;
}

export const PHONE_STEP_DECLINED: PhoneStepOutcome = {
  content: 'The user declined this on their phone, so nothing was added.',
  isError: true,
};

const CALENDAR_OFF: PhoneStepOutcome = {
  content:
    "Calendar access is off for AGI Workforce on this phone, so nothing was read or added. The user can turn it on for AGI Workforce in the phone's Settings app.",
  isError: true,
};

const REMINDERS_OFF: PhoneStepOutcome = {
  content:
    "Reminders access is off for AGI Workforce on this phone, so nothing was added. The user can turn it on for AGI Workforce in the phone's Settings app.",
  isError: true,
};

const MAX_LISTED_EVENTS = 80;
const MAX_EVENT_NOTES_LENGTH = 200;

export function readPhoneDeviceStep(
  envelope: AgentEventEnvelope | undefined,
): PhoneDeviceStep | null {
  const event = envelope?.event;
  if (event?.type !== 'device-step-requested' || !isPhoneStepTool(event.toolName)) return null;
  const input = event.input;
  return {
    toolCallId: event.toolCallId,
    name: event.toolName,
    deviceId: event.deviceId,
    input:
      input && typeof input === 'object' && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {},
  };
}

async function accessGranted(
  current: () => Promise<Calendar.PermissionResponse>,
  request: () => Promise<Calendar.PermissionResponse>,
): Promise<boolean> {
  const status = await current();
  if (status.granted) return true;
  if (!status.canAskAgain) return false;
  return (await request()).granted;
}

function calendarAccess(): Promise<boolean> {
  return accessGranted(
    Calendar.getCalendarPermissionsAsync,
    Calendar.requestCalendarPermissionsAsync,
  );
}

function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function wallClock(value: string | Date): string {
  return formatPhoneStepTime(new Date(value));
}

function stepTime(value: string | undefined): Date {
  const date = value ? parsePhoneStepTime(value) : null;
  if (!date) throw new PhoneStepRefused('The step has no time the phone can read.');
  return date;
}

async function eventsBetween(
  start: Date,
  end: Date,
): Promise<{ events: Calendar.Event[]; calendarTitles: Map<string, string> }> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (calendars.length === 0) return { events: [], calendarTitles: new Map() };
  const events = await Calendar.getEventsAsync(
    calendars.map((calendar) => calendar.id),
    start,
    end,
  );
  return {
    events: events
      .filter((event) => event.status !== Calendar.EventStatus.CANCELED)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
    calendarTitles: new Map(calendars.map((calendar) => [calendar.id, calendar.title])),
  };
}

function listedEvent(event: Calendar.Event, calendarTitles: Map<string, string>) {
  const calendar = calendarTitles.get(event.calendarId);
  return {
    title: event.title || 'Untitled event',
    start: wallClock(event.startDate),
    end: wallClock(event.endDate),
    ...(event.allDay ? { allDay: true } : {}),
    ...(event.location ? { location: event.location } : {}),
    ...(event.notes ? { notes: event.notes.slice(0, MAX_EVENT_NOTES_LENGTH) } : {}),
    ...(calendar ? { calendar } : {}),
    ...(event.availability === Calendar.Availability.FREE ? { showsAsFree: true } : {}),
  };
}

async function readEvents(request: PhoneStepRequest): Promise<PhoneStepOutcome> {
  const { events, calendarTitles } = await eventsBetween(
    stepTime(request.start),
    stepTime(request.end),
  );
  const listed = events
    .slice(0, MAX_LISTED_EVENTS)
    .map((event) => listedEvent(event, calendarTitles));
  let count = listed.length;
  for (;;) {
    const content = JSON.stringify({
      timeZone: timeZone(),
      events: listed.slice(0, count),
      ...(events.length > count ? { notListed: events.length - count } : {}),
    });
    if (content.length <= MAX_DEVICE_STEP_OUTPUT_LENGTH || count === 0) {
      return { content, isError: false };
    }
    count = Math.floor(count * 0.75);
  }
}

async function readAvailability(request: PhoneStepRequest): Promise<PhoneStepOutcome> {
  const from = stepTime(request.start).getTime();
  const to = stepTime(request.end).getTime();
  const { events } = await eventsBetween(new Date(from), new Date(to));
  const intervals = events
    .filter((event) => event.availability !== Calendar.Availability.FREE)
    .map((event): [number, number] => [
      Math.max(from, new Date(event.startDate).getTime()),
      Math.min(to, new Date(event.endDate).getTime()),
    ])
    .filter(([start, end]) => start < end);
  const busy: Array<[number, number]> = [];
  for (const [start, end] of intervals) {
    const last = busy[busy.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else busy.push([start, end]);
  }
  const free: Array<[number, number]> = [];
  let cursor = from;
  for (const [start, end] of busy) {
    if (start > cursor) free.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < to) free.push([cursor, to]);
  const spans = (list: Array<[number, number]>) =>
    list.map(([start, end]) => ({
      start: wallClock(new Date(start)),
      end: wallClock(new Date(end)),
    }));
  return {
    content: JSON.stringify({ timeZone: timeZone(), busy: spans(busy), free: spans(free) }),
    isError: false,
  };
}

async function writableCalendar(): Promise<Calendar.Calendar | null> {
  if (Platform.OS === 'ios') return Calendar.getDefaultCalendarAsync();
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return (
    calendars.find((calendar) => calendar.isPrimary && calendar.allowsModifications) ??
    calendars.find((calendar) => calendar.allowsModifications) ??
    null
  );
}

async function createEvent(request: PhoneStepRequest): Promise<PhoneStepOutcome> {
  const calendar = await writableCalendar();
  if (!calendar) {
    return {
      content: 'There is no calendar on this phone that events can be added to.',
      isError: true,
    };
  }
  const allDay = request.allDay === true;
  const startDate = stepTime(request.start);
  const endDate = request.end ? stepTime(request.end) : startDate;
  await Calendar.createEventAsync(calendar.id, {
    title: request.title ?? '',
    startDate,
    endDate,
    allDay,
    timeZone: timeZone(),
    ...(request.location ? { location: request.location } : {}),
    ...(request.notes ? { notes: request.notes } : {}),
  });
  const when = allDay
    ? `on ${formatPhoneStepTime(startDate).slice(0, 10)}`
    : `from ${formatPhoneStepTime(startDate)} to ${formatPhoneStepTime(endDate)}`;
  return {
    content: `Added "${request.title}" to the ${calendar.title} calendar ${when} (${timeZone()}).`,
    isError: false,
  };
}

async function createReminder(request: PhoneStepRequest): Promise<PhoneStepOutcome> {
  if (Platform.OS !== 'ios') {
    return { content: 'Reminders can be added only from an iPhone.', isError: true };
  }
  const granted = await accessGranted(
    Calendar.getRemindersPermissionsAsync,
    Calendar.requestRemindersPermissionsAsync,
  );
  if (!granted) return REMINDERS_OFF;
  const dueDate = request.due ? stepTime(request.due) : null;
  const allDay = request.due !== undefined && !request.due.includes('T');
  await Calendar.createReminderAsync(null, {
    title: request.title ?? '',
    ...(request.notes ? { notes: request.notes } : {}),
    ...(dueDate
      ? {
          dueDate,
          allDay,
          ...(allDay ? {} : { alarms: [{ absoluteDate: dueDate.toISOString() }] }),
        }
      : {}),
  });
  return {
    content: dueDate
      ? `Added the reminder "${request.title}" due ${formatPhoneStepTime(dueDate)} (${timeZone()}).`
      : `Added the reminder "${request.title}".`,
    isError: false,
  };
}

export async function runPhoneDeviceStep(step: PhoneDeviceStep): Promise<PhoneStepOutcome> {
  if (step.deviceId !== (await getDeviceId())) {
    return {
      content: 'This step was meant for another device, so this phone did not run it.',
      isError: true,
    };
  }
  try {
    const request = planPhoneStep(step.name, step.input);
    if (request.tool === 'device_reminder_create') return await createReminder(request);
    if (!(await calendarAccess())) return CALENDAR_OFF;
    if (request.tool === 'device_calendar_events') return await readEvents(request);
    if (request.tool === 'device_calendar_availability') return await readAvailability(request);
    return await createEvent(request);
  } catch (error) {
    if (error instanceof PhoneStepRefused) return { content: error.message, isError: true };
    const reason =
      error instanceof Error && error.message ? `: ${error.message.slice(0, 300)}` : '.';
    return { content: `The phone could not complete this step${reason}`, isError: true };
  }
}
