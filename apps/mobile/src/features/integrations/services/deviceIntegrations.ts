import * as Calendar from 'expo-calendar/legacy';

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
