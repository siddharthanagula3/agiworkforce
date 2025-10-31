import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { toast } from 'sonner';

import type {
  CalendarAccount,
  CalendarSummary,
  CalendarEvent,
  EventDateTime,
  ListEventsOptions,
  CalendarProvider,
  CreateEventRequest,
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
  error: string | null;
  pendingAuth: PendingAuthorization | null;

  refreshAccounts: () => Promise<void>;
  beginConnect: (config: CalendarConnectConfig) => Promise<void>;
  completeConnect: (code: string) => Promise<void>;
  selectAccount: (accountId: string | null) => Promise<void>;
  selectCalendar: (calendarId: string | null) => Promise<void>;
  refreshEvents: (options?: Partial<ListEventsOptions>) => Promise<void>;
  createEvent: (request: CreateEventRequest) => Promise<void>;
  updateEvent: (calendarId: string, eventId: string, request: UpdateEventRequest) => Promise<void>;
  deleteEvent: (calendarId: string, eventId: string) => Promise<void>;
  clearError: () => void;
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

function normalizeDateTime(value: any): EventDateTime {
  if (value && typeof value === 'object' && 'date_time' in value) {
    return {
      kind: 'dateTime',
      date_time: value.date_time,
      timezone: value.timezone ?? 'UTC',
    };
  }
  if (value && typeof value === 'object' && 'date' in value) {
    return {
      kind: 'date',
      date: value.date,
    };
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
    start: normalizeDateTime(event.start as any),
    end: normalizeDateTime(event.end as any),
  };
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  accounts: [],
  calendars: [],
  events: [],
  selectedAccountId: null,
  selectedCalendarId: null,
  loading: false,
  error: null,
  pendingAuth: null,

  refreshAccounts: async () => {
    try {
      const accounts = await invoke<CalendarAccount[]>('calendar_list_accounts');
      set({
        accounts: accounts.map(normalizeAccount),
      });

      const { selectedAccountId } = get();
      if (!selectedAccountId && accounts.length > 0) {
        await get().selectAccount(accounts[0].account_id);
      } else if (
        selectedAccountId &&
        accounts.length > 0 &&
        !accounts.some((account) => account.account_id === selectedAccountId)
      ) {
        await get().selectAccount(accounts[0].account_id);
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
      toast.info('Authorize access in the opened browser window, then paste the code to complete connection.');
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
        account_id: accountId,
      });
      set({
        calendars,
        selectedCalendarId: calendars.length > 0 ? calendars[0].id : null,
      });

      if (calendars.length > 0) {
        await get().refreshEvents({
          calendar_id: calendars[0].id,
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

    const calendarId = options?.calendar_id ?? selectedCalendarId;
    if (!calendarId) {
      return;
    }

    const now = new Date();
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    try {
      set({ loading: true, error: null });
      const response = await invoke<{ events: CalendarEvent[] }>('calendar_list_events', {
        account_id: selectedAccountId,
        request: {
          calendar_id: calendarId,
          start_time: now.toISOString(),
          end_time: options?.end_time ?? end.toISOString(),
          max_results: options?.max_results ?? 50,
          show_deleted: options?.show_deleted ?? false,
        },
      });

      set({
        events: response.events.map(normalizeEvent),
        selectedCalendarId: calendarId,
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
        account_id: selectedAccountId,
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
        account_id: selectedAccountId,
        calendar_id: calendarId,
        event_id: eventId,
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
        account_id: selectedAccountId,
        calendar_id: calendarId,
        event_id: eventId,
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

  clearError: () => set({ error: null }),
}));

type AccountIdResponse = {
  account_id: string;
};
