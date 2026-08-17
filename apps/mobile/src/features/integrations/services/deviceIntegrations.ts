import * as Calendar from 'expo-calendar';

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  location: string | null;
  notes: string | null;
  calendarTitle: string | null;
}

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export async function getCalendarPermissionStatus(): Promise<PermissionStatus> {
  const { status } = await Calendar.getCalendarPermissionsAsync();
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

export async function requestCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

export async function getUpcomingEvents(days: number = 7): Promise<CalendarEvent[]> {
  const hasPermission = await requestCalendarPermission();
  if (!hasPermission) return [];

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (calendars.length === 0) return [];

  const calendarMap = new Map(calendars.map((c) => [c.id, c.title]));

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  const calendarIds = calendars.map((c) => c.id);

  const events = await Calendar.getEventsAsync(calendarIds, startDate, endDate);

  return events.map((event) => ({
    id: event.id,
    title: event.title ?? 'Untitled',
    startDate:
      event.startDate instanceof Date
        ? event.startDate.toISOString()
        : String(event.startDate ?? startDate.toISOString()),
    endDate:
      event.endDate instanceof Date
        ? event.endDate.toISOString()
        : String(event.endDate ?? startDate.toISOString()),
    location: event.location ?? null,
    notes: event.notes ?? null,
    calendarTitle: calendarMap.get(event.calendarId) ?? null,
  }));
}
