/**
 * Calendar API — typed wrappers for calendar_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface CalendarOAuthConfig {
  provider: string;
  clientId: string;
  clientSecret: string;
  [key: string]: unknown;
}
export interface AuthorizationUrlResponse {
  url: string;
  state: string;
}
export interface CompleteOAuthRequest {
  code: string;
  state: string;
}
export interface AccountIdResponse {
  accountId: string;
}
export interface Calendar {
  id: string;
  name: string;
  color?: string;
  primary: boolean;
}
export interface ListEventsRequest {
  calendarId: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
}
export interface EventListResponse {
  events: CalendarEvent[];
  nextPageToken?: string;
}
export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  attendees?: string[];
  status: string;
}
export interface CreateEventRequest {
  calendarId: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  attendees?: string[];
}
export interface UpdateEventRequest {
  summary?: string;
  description?: string;
  start?: string;
  end?: string;
  location?: string;
}
export interface CalendarAccount {
  id: string;
  provider: string;
  email: string;
  connected: boolean;
}
export interface CalendarSyncResponse {
  synced: number;
  errors: string[];
}

// ---- Commands ----

export async function calendarConnect(
  config: CalendarOAuthConfig,
): Promise<AuthorizationUrlResponse> {
  return command<AuthorizationUrlResponse>('calendar_connect', { config });
}
export async function calendarCompleteOauth(
  request: CompleteOAuthRequest,
): Promise<AccountIdResponse> {
  return command<AccountIdResponse>('calendar_complete_oauth', { request });
}
export async function calendarDisconnect(accountId: string): Promise<void> {
  return command<void>('calendar_disconnect', { accountId });
}
export async function calendarListCalendars(accountId: string): Promise<Calendar[]> {
  return command<Calendar[]>('calendar_list_calendars', { accountId });
}
export async function calendarListEvents(
  accountId: string,
  request: ListEventsRequest,
): Promise<EventListResponse> {
  return command<EventListResponse>('calendar_list_events', { accountId, request });
}
export async function calendarCreateEvent(
  accountId: string,
  request: CreateEventRequest,
): Promise<CalendarEvent> {
  return command<CalendarEvent>('calendar_create_event', { accountId, request });
}
export async function calendarUpdateEvent(
  accountId: string,
  calendarId: string,
  eventId: string,
  request: UpdateEventRequest,
): Promise<CalendarEvent> {
  return command<CalendarEvent>('calendar_update_event', {
    accountId,
    calendarId,
    eventId,
    request,
  });
}
export async function calendarDeleteEvent(
  accountId: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  return command<void>('calendar_delete_event', { accountId, calendarId, eventId });
}
export async function calendarListAccounts(): Promise<CalendarAccount[]> {
  return command<CalendarAccount[]>('calendar_list_accounts');
}
export async function calendarGetSystemTimezone(): Promise<string> {
  return command<string>('calendar_get_system_timezone');
}
export async function calendarGetEvent(
  accountId: string,
  calendarId: string,
  eventId: string,
): Promise<CalendarEvent> {
  return command<CalendarEvent>('calendar_get_event', { accountId, calendarId, eventId });
}
export async function calendarSync(accountId: string): Promise<CalendarSyncResponse> {
  return command<CalendarSyncResponse>('calendar_sync', { accountId });
}
