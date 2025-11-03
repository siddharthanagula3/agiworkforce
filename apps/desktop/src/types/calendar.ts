export type CalendarProvider = 'google' | 'outlook';

export interface CalendarAccount {
  account_id: string;
  provider: CalendarProvider;
  email?: string | null;
  display_name?: string | null;
  connected_at: string;
}

export interface CalendarSummary {
  id: string;
  name: string;
  description?: string | null;
  timezone: string;
  is_primary: boolean;
  color?: string | null;
  access_role: string;
}

export type EventDateTime =
  | {
      kind: 'dateTime';
      date_time: string;
      timezone: string;
    }
  | {
      kind: 'date';
      date: string;
    };

export interface Attendee {
  email: string;
  display_name?: string | null;
  response_status: 'needsAction' | 'accepted' | 'declined' | 'tentative';
  is_organizer: boolean;
  is_optional: boolean;
}

export interface Reminder {
  method: 'email' | 'popup' | 'notification';
  minutes_before: number;
}

export interface Recurrence {
  frequency: 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
  interval: number;
  count?: number | null;
  until?: string | null;
}

export interface CalendarEvent {
  id: string;
  calendar_id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: EventDateTime;
  end: EventDateTime;
  attendees: Attendee[];
  reminders: Reminder[];
  recurrence?: Recurrence | null;
  status: 'confirmed' | 'tentative' | 'cancelled';
  created_at: string;
  updated_at: string;
  html_link?: string | null;
  meeting_url?: string | null;
}

export interface ListEventsOptions {
  calendar_id: string;
  start_time: string;
  end_time: string;
  max_results?: number;
  show_deleted?: boolean;
}

export interface CreateEventRequest {
  calendar_id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: EventDateTime;
  end: EventDateTime;
  attendees: string[];
  reminders: Reminder[];
  recurrence?: Recurrence | null;
}

export interface UpdateEventRequest {
  title?: string;
  description?: string | null;
  location?: string | null;
  start?: EventDateTime;
  end?: EventDateTime;
  attendees?: string[];
  reminders?: Reminder[];
  recurrence?: Recurrence | null;
  status?: 'confirmed' | 'tentative' | 'cancelled';
}
