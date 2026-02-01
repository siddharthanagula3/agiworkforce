import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

import type {
  CalendarAccount,
  CalendarEvent,
  CalendarSummary,
  CreateEventRequest,
  ListEventsOptions,
  UpdateEventRequest,
} from '../types/calendar';

/**
 * Response from calendar_list_events command
 */
interface EventListResponse {
  events: CalendarEvent[];
  next_page_token?: string | null;
}

/**
 * Response from calendar_sync command
 */
interface SyncResponse {
  calendars_synced: number;
  events_synced: number;
  errors: string[];
}

/**
 * Hook for calendar operations with the Tauri backend.
 * Provides functions for listing, creating, updating, and deleting calendar events.
 */
export function useCalendar() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * List all connected calendar accounts.
   */
  const listAccounts = useCallback(async (): Promise<CalendarAccount[]> => {
    setLoading(true);
    setError(null);
    try {
      const accounts = await invoke<CalendarAccount[]>('calendar_list_accounts');
      return accounts;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * List calendars for a specific account.
   */
  const listCalendars = useCallback(async (accountId: string): Promise<CalendarSummary[]> => {
    setLoading(true);
    setError(null);
    try {
      const calendars = await invoke<CalendarSummary[]>('calendar_list_calendars', {
        account_id: accountId,
      });
      return calendars;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * List events in a calendar within a time range.
   */
  const listEvents = useCallback(
    async (accountId: string, options: ListEventsOptions): Promise<CalendarEvent[]> => {
      setLoading(true);
      setError(null);
      try {
        const response = await invoke<EventListResponse>('calendar_list_events', {
          account_id: accountId,
          request: {
            calendar_id: options.calendar_id,
            start_time: options.start_time,
            end_time: options.end_time,
            max_results: options.max_results ?? 100,
            show_deleted: options.show_deleted ?? false,
          },
        });
        return response.events;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * Get a single event by ID.
   */
  const getEvent = useCallback(
    async (accountId: string, calendarId: string, eventId: string): Promise<CalendarEvent> => {
      setLoading(true);
      setError(null);
      try {
        const event = await invoke<CalendarEvent>('calendar_get_event', {
          account_id: accountId,
          calendar_id: calendarId,
          event_id: eventId,
        });
        return event;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * Create a new event in a calendar.
   */
  const createEvent = useCallback(
    async (accountId: string, request: CreateEventRequest): Promise<CalendarEvent> => {
      setLoading(true);
      setError(null);
      try {
        const event = await invoke<CalendarEvent>('calendar_create_event', {
          account_id: accountId,
          request,
        });
        return event;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * Update an existing event.
   */
  const updateEvent = useCallback(
    async (
      accountId: string,
      calendarId: string,
      eventId: string,
      request: UpdateEventRequest,
    ): Promise<CalendarEvent> => {
      setLoading(true);
      setError(null);
      try {
        const event = await invoke<CalendarEvent>('calendar_update_event', {
          account_id: accountId,
          calendar_id: calendarId,
          event_id: eventId,
          request,
        });
        return event;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * Delete an event from a calendar.
   */
  const deleteEvent = useCallback(
    async (accountId: string, calendarId: string, eventId: string): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        await invoke('calendar_delete_event', {
          account_id: accountId,
          calendar_id: calendarId,
          event_id: eventId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * Sync calendars with the remote provider.
   * This refreshes all calendars and events from the provider.
   */
  const sync = useCallback(async (accountId: string): Promise<SyncResponse> => {
    setSyncing(true);
    setError(null);
    try {
      const response = await invoke<SyncResponse>('calendar_sync', {
        account_id: accountId,
      });
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setSyncing(false);
    }
  }, []);

  /**
   * Get the system timezone.
   */
  const getSystemTimezone = useCallback(async (): Promise<string> => {
    try {
      const timezone = await invoke<string>('calendar_get_system_timezone');
      return timezone;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Clear the current error state.
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    loading,
    syncing,
    error,

    // Account operations
    listAccounts,

    // Calendar operations
    listCalendars,

    // Event operations
    listEvents,
    getEvent,
    createEvent,
    updateEvent,
    deleteEvent,

    // Sync operations
    sync,

    // Utilities
    getSystemTimezone,
    clearError,
  };
}

export type UseCalendarReturn = ReturnType<typeof useCalendar>;
