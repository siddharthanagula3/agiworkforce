import { open } from '@tauri-apps/plugin-shell';
import { toast } from 'sonner';
import { create } from 'zustand';
import { invoke } from '../lib/tauri-mock';

import type {
  CalendarAccount,
  CalendarEvent,
  CalendarProvider,
  CalendarSummary,
  CreateEventRequest,
  EventDateTime,
  ListEventsOptions,
  UpdateEventRequest,
} from '../types/calendar';

interface PendingAuthorization {
  state: string;
  provider: CalendarProvider;
}

interface CalendarState {
  accounts: CalendarAccount[];
  calendars: CalendarSummary[];
  events: CalendarEvent[];
  selectedAccountId: string | null;
  selectedCalendarId: string | null;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  pendingAuth: PendingAuthorization | null;

  refreshAccounts: () => Promise<void>;
  beginConnect: (config: CalendarConnectConfig) => Promise<void>;
  completeConnect: (code: string) => Promise<void>;
  disconnectAccount: (accountId: string) => Promise<void>;
  selectAccount: (accountId: string | null) => Promise<void>;
  selectCalendar: (calendarId: string | null) => Promise<void>;
  refreshEvents: (options?: Partial<ListEventsOptions>) => Promise<void>;
  getEvent: (calendarId: string, eventId: string) => Promise<CalendarEvent>;
  createEvent: (request: CreateEventRequest) => Promise<void>;
  updateEvent: (calendarId: string, eventId: string, request: UpdateEventRequest) => Promise<void>;
  deleteEvent: (calendarId: string, eventId: string) => Promise<void>;
  syncCalendar: () => Promise<CalendarSyncResponse>;
  getSystemTimezone: () => Promise<string>;
  clearError: () => void;
}

export interface CalendarSyncResponse {
  calendars_synced: number;
  events_synced: number;
  errors: string[];
}

export interface CalendarConnectConfig {
  provider: CalendarProvider;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function normalizeAccount(account: CalendarAccount): CalendarAccount {
  return {
    ...account,
    connected_at: account.connected_at,
  };
}

type EventDateTimeLike =
  | EventDateTime
  | {
      date_time?: string;
      date?: string;
      timezone?: string | null;
    }
  | null
  | undefined;

function hasDateTime(
  value: EventDateTimeLike,
): value is { date_time: string; timezone?: string | null } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if ('date_time' in value) {
    const record = value as { date_time?: unknown };
    return typeof record.date_time === 'string';
  }

  return false;
}

function hasDate(value: EventDateTimeLike): value is { date: string } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if ('date' in value) {
    const record = value as { date?: unknown };
    return typeof record.date === 'string';
  }

  return false;
}

function normalizeDateTime(value: EventDateTimeLike): EventDateTime {
  if (hasDateTime(value)) {
    return {
      kind: 'dateTime',
      date_time: value.date_time,
      timezone:
        typeof value.timezone === 'string' && value.timezone.trim().length > 0
          ? value.timezone
          : 'UTC',
    };
  }

  if (hasDate(value)) {
    return {
      kind: 'date',
      date: value.date,
    };
  }

  if (value && typeof value === 'object' && 'kind' in value) {
    return value as EventDateTime;
  }

  return {
    kind: 'dateTime',
    date_time: new Date().toISOString(),
    timezone: 'UTC',
  };
}

function normalizeEvent(event: CalendarEvent): CalendarEvent {
  return {
    ...event,
    start: normalizeDateTime(event.start),
    end: normalizeDateTime(event.end),
  };
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  accounts: [],
  calendars: [],
  events: [],
  selectedAccountId: null,
  selectedCalendarId: null,
  loading: false,
  syncing: false,
  error: null,
  pendingAuth: null,

  refreshAccounts: async () => {
    try {
      const accounts = await invoke<CalendarAccount[]>('calendar_list_accounts');
      set({
        accounts: accounts.map(normalizeAccount),
      });

      const { selectedAccountId } = get();
      const firstAccount = accounts[0];

      if (!selectedAccountId && firstAccount) {
        await get().selectAccount(firstAccount.account_id);
      } else if (
        selectedAccountId &&
        !accounts.some((account) => account.account_id === selectedAccountId)
      ) {
        const fallbackAccount = accounts[0];
        if (fallbackAccount) {
          await get().selectAccount(fallbackAccount.account_id);
        }
      }
    } catch (error) {
      console.error('[calendar] failed to load accounts', error);
      set({ error: (error as Error).message });
    }
  },

  beginConnect: async ({ provider, clientId, clientSecret, redirectUri }) => {
    try {
      const response = await invoke<{ auth_url: string; state: string }>('calendar_connect', {
        config: {
          provider,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        },
      });

      set({
        pendingAuth: {
          state: response.state,
          provider,
        },
      });

      await open(response.auth_url);
      toast.info(
        'Authorize access in the opened browser window, then paste the code to complete connection.',
      );
    } catch (error) {
      console.error('[calendar] failed to start OAuth', error);
      set({ error: (error as Error).message });
      throw error;
    }
  },

  completeConnect: async (code: string) => {
    const { pendingAuth } = get();
    if (!pendingAuth) {
      toast.error('Start the connection flow before completing it.');
      return;
    }

    try {
      set({ loading: true });
      await invoke<AccountIdResponse>('calendar_complete_oauth', {
        request: {
          state: pendingAuth.state,
          code,
        },
      });
      toast.success('Calendar connected');
      set({ pendingAuth: null });
      await get().refreshAccounts();
    } catch (error) {
      console.error('[calendar] failed to complete OAuth', error);
      set({ error: (error as Error).message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  disconnectAccount: async (accountId) => {
    try {
      set({ loading: true, error: null });
      await invoke('calendar_disconnect', { accountId });
      set((state) => ({
        accounts: state.accounts.filter((acc) => acc.account_id !== accountId),
        selectedAccountId: state.selectedAccountId === accountId ? null : state.selectedAccountId,
        calendars: state.selectedAccountId === accountId ? [] : state.calendars,
        events: state.selectedAccountId === accountId ? [] : state.events,
        loading: false,
      }));
      toast.success('Calendar disconnected');
      const remaining = get().accounts;
      const next = remaining[0];
      if (next) {
        await get().selectAccount(next.account_id);
      }
    } catch (error) {
      console.error('[calendar] disconnect failed', error);
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  selectAccount: async (accountId) => {
    set({
      selectedAccountId: accountId,
      calendars: [],
      events: [],
      selectedCalendarId: null,
    });

    if (!accountId) {
      return;
    }

    try {
      const calendars = await invoke<CalendarSummary[]>('calendar_list_calendars', {
        accountId,
      });
      const firstCalendar = calendars[0];
      set({
        calendars,
        selectedCalendarId: firstCalendar?.id ?? null,
      });

      if (firstCalendar) {
        await get().refreshEvents({
          calendar_id: firstCalendar.id,
        });
      }
    } catch (error) {
      console.error('[calendar] failed to load calendars', error);
      set({ error: (error as Error).message });
    }
  },

  selectCalendar: async (calendarId) => {
    set({ selectedCalendarId: calendarId });
    if (calendarId) {
      await get().refreshEvents({
        calendar_id: calendarId,
      });
    } else {
      set({ events: [] });
    }
  },

  refreshEvents: async (options) => {
    const { selectedAccountId, selectedCalendarId } = get();
    if (!selectedAccountId) {
      return;
    }

    const potentialCalendarId = options?.calendar_id ?? selectedCalendarId;
    if (typeof potentialCalendarId !== 'string') {
      return;
    }
    const targetCalendarId = potentialCalendarId;

    const now = new Date();
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    try {
      set({ loading: true, error: null });
      const response = await invoke<{ events: CalendarEvent[] }>('calendar_list_events', {
        accountId: selectedAccountId,
        request: {
          calendarId: targetCalendarId,
          startTime: now.toISOString(),
          endTime: options?.end_time ?? end.toISOString(),
          maxResults: options?.max_results ?? 50,
          showDeleted: options?.show_deleted ?? false,
        },
      });

      set({
        events: response.events.map(normalizeEvent),
        selectedCalendarId: targetCalendarId,
        loading: false,
      });
    } catch (error) {
      console.error('[calendar] failed to load events', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  createEvent: async (request) => {
    const { selectedAccountId } = get();
    if (!selectedAccountId) {
      toast.error('Select an account before creating events.');
      return;
    }

    if (!request.calendar_id) {
      toast.error('Select a calendar before creating events.');
      return;
    }

    try {
      set({ loading: true, error: null });
      const created = await invoke<CalendarEvent>('calendar_create_event', {
        accountId: selectedAccountId,
        request,
      });

      set((state) => ({
        events: [...state.events, normalizeEvent(created)],
        loading: false,
      }));
      toast.success('Event created');
    } catch (error) {
      console.error('[calendar] failed to create event', error);
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  updateEvent: async (calendarId, eventId, request) => {
    const { selectedAccountId } = get();
    if (!selectedAccountId) {
      toast.error('Select an account before updating events.');
      return;
    }

    try {
      set({ loading: true, error: null });
      const updated = await invoke<CalendarEvent>('calendar_update_event', {
        accountId: selectedAccountId,
        calendarId,
        eventId,
        request,
      });

      set((state) => ({
        events: state.events.map((event) =>
          event.id === eventId ? normalizeEvent(updated) : event,
        ),
        loading: false,
      }));
      toast.success('Event updated');
    } catch (error) {
      console.error('[calendar] failed to update event', error);
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  deleteEvent: async (calendarId, eventId) => {
    const { selectedAccountId } = get();
    if (!selectedAccountId) {
      toast.error('Select an account before deleting events.');
      return;
    }

    try {
      set({ loading: true, error: null });
      await invoke('calendar_delete_event', {
        accountId: selectedAccountId,
        calendarId,
        eventId,
      });

      set((state) => ({
        events: state.events.filter((event) => event.id !== eventId),
        loading: false,
      }));
      toast.success('Event deleted');
    } catch (error) {
      console.error('[calendar] failed to delete event', error);
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  getEvent: async (calendarId, eventId) => {
    const { selectedAccountId } = get();
    if (!selectedAccountId) {
      throw new Error('No calendar account selected');
    }

    try {
      set({ loading: true, error: null });
      const event = await invoke<CalendarEvent>('calendar_get_event', {
        accountId: selectedAccountId,
        calendarId,
        eventId,
      });
      set({ loading: false });
      return normalizeEvent(event);
    } catch (error) {
      console.error('[calendar] failed to get event', error);
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },

  syncCalendar: async () => {
    const { selectedAccountId } = get();
    if (!selectedAccountId) {
      throw new Error('No calendar account selected');
    }

    try {
      set({ syncing: true, error: null });
      const response = await invoke<CalendarSyncResponse>('calendar_sync', {
        accountId: selectedAccountId,
      });

      if (response.errors.length > 0) {
        console.warn('[calendar] sync completed with errors', response.errors);
      }

      await get().refreshEvents();
      set({ syncing: false });
      toast.success(
        `Synced ${response.calendars_synced} calendars, ${response.events_synced} events`,
      );
      return response;
    } catch (error) {
      console.error('[calendar] sync failed', error);
      set({ error: (error as Error).message, syncing: false });
      throw error;
    }
  },

  getSystemTimezone: async () => {
    try {
      const timezone = await invoke<string>('calendar_get_system_timezone');
      return timezone;
    } catch (error) {
      console.error('[calendar] failed to get system timezone', error);
      set({ error: (error as Error).message });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));

type AccountIdResponse = {
  account_id: string;
};
