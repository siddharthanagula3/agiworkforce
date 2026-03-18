import * as Calendar from 'expo-calendar';
import * as Contacts from 'expo-contacts';
import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  location: string | null;
  notes: string | null;
  calendarTitle: string | null;
}

export interface ContactEntry {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export async function getCalendarPermissionStatus(): Promise<PermissionStatus> {
  const { status } = await Calendar.getCalendarPermissionsAsync();
  if (status === Calendar.PermissionStatus.GRANTED) return 'granted';
  if (status === Calendar.PermissionStatus.DENIED) return 'denied';
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

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function getContactsPermissionStatus(): Promise<PermissionStatus> {
  const { status } = await Contacts.getPermissionsAsync();
  if (status === Contacts.PermissionStatus.GRANTED) return 'granted';
  if (status === Contacts.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

export async function requestContactsPermission(): Promise<boolean> {
  const { status } = await Contacts.requestPermissionsAsync();
  return status === 'granted';
}

export async function searchContacts(query: string): Promise<ContactEntry[]> {
  const hasPermission = await requestContactsPermission();
  if (!hasPermission) return [];

  if (!query.trim()) return [];

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
    name: query,
    pageSize: 20,
    pageOffset: 0,
  });

  return data.map((contact) => {
    const phone = contact.phoneNumbers?.[0]?.number ?? null;
    const email = contact.emails?.[0]?.email ?? null;
    const name =
      (contact.name ?? [contact.firstName, contact.lastName].filter(Boolean).join(' ')) ||
      'Unknown';

    return {
      id: contact.id ?? String(Math.random()),
      name,
      phone,
      email,
    };
  });
}

/**
 * Get a count of total contacts (useful for displaying in settings).
 */
export async function getContactsCount(): Promise<number> {
  const hasPermission = await requestContactsPermission();
  if (!hasPermission) return 0;

  // Use a minimal fields request to count contacts efficiently
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name],
    pageSize: 1,
  });

  // expo-contacts doesn't expose total count directly in all versions,
  // but the data length with pageSize=1 and hasPreviousPage/hasNextPage
  // gives at least a partial signal. For a true count we need all.
  if (Platform.OS === 'ios') {
    // On iOS, getContactsAsync without pageSize returns all
    const all = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name] });
    return all.data.length;
  }

  return data.length > 0 ? -1 : 0; // -1 signals "has contacts but count unknown"
}
