// Updated Nov 16, 2025: Added accessible dialogs to replace window.confirm
import { useCallback, useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { toast } from 'sonner';
import { Calendar, Link, Plus, RefreshCcw, CalendarRange, Pencil, Trash2 } from 'lucide-react';
import { format as formatDate, parseISO } from 'date-fns';

import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/Dialog';
import { ScrollArea } from '../ui/ScrollArea';
import { useCalendarStore, type CalendarConnectConfig } from '../../stores/calendarStore';
import type { CalendarEvent, EventDateTime, CalendarProvider } from '../../types/calendar';
import CalendarMonthView from './CalendarMonthView';
import { useConfirm } from '../ui/ConfirmDialog';

interface CalendarWorkspaceProps {
  className?: string;
}

const PROVIDER_OPTIONS = [
  { value: 'google' as const, label: 'Google Calendar' },
  { value: 'outlook' as const, label: 'Microsoft Outlook' },
];

const formatDateTimeLocal = (date: Date) => {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
};

const eventDateTimeToLocalInput = (value: EventDateTime) => {
  if (value.kind === 'dateTime') {
    return formatDateTimeLocal(new Date(value.date_time));
  }
  return `${value.date}T00:00`;
};

const eventDateTimeToDate = (value: EventDateTime): Date => {
  if (value.kind === 'dateTime') {
    return parseISO(value.date_time);
  }
  return parseISO(value.date);
};

export function CalendarWorkspace({ className }: CalendarWorkspaceProps) {
  const {
    accounts,
    calendars,
    events,
    selectedAccountId,
    selectedCalendarId,
    loading,
    error,
    pendingAuth,
    refreshAccounts,
    beginConnect,
    completeConnect,
    selectAccount,
    selectCalendar,
    refreshEvents,
    createEvent,
    updateEvent,
    deleteEvent,
  } = useCalendarStore();

  const [connectOpen, setConnectOpen] = useState(false);
  const [connectConfig, setConnectConfig] = useState<CalendarConnectConfig>({
    provider: 'google',
    clientId: '',
    clientSecret: '',
    redirectUri: 'http://localhost:5173/auth/callback',
  });
  const [authCode, setAuthCode] = useState('');
  const [viewDate, setViewDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => new Date());

  // Updated Nov 16, 2025: Use accessible dialogs
  const { confirm, dialog: confirmDialog } = useConfirm();

  const createDefaultForm = useCallback(() => {
    const base = selectedDate ? new Date(selectedDate) : new Date();

    if (selectedDate) {
      base.setHours(9, 0, 0, 0);
    } else {
      base.setSeconds(0, 0);
      const minuteOffset = base.getMinutes() % 5;
      if (minuteOffset !== 0) {
        base.setMinutes(base.getMinutes() + (5 - minuteOffset));
      }
    }

    const end = new Date(base.getTime() + 60 * 60 * 1000);

    return {
      title: '',
      description: '',
      location: '',
      start: formatDateTimeLocal(base),
      end: formatDateTimeLocal(end),
    };
  }, [selectedDate]);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [eventForm, setEventForm] = useState(() => createDefaultForm());

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    if (error) {
      console.error('[calendar]', error);
    }
  }, [error]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.account_id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );

  const selectedCalendar = useMemo(
    () => calendars.find((calendar) => calendar.id === selectedCalendarId) ?? null,
    [calendars, selectedCalendarId],
  );

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((event) => {
      const startDate = eventDateTimeToDate(event.start);
      const key = formatDate(startDate, 'yyyy-MM-dd');
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push(event);
    });

    Object.values(map).forEach((list) => {
      list.sort(
        (a, b) => eventDateTimeToDate(a.start).getTime() - eventDateTimeToDate(b.start).getTime(),
      );
    });

    return map;
  }, [events]);

  const selectedDayKey = useMemo(
    () => (selectedDate ? formatDate(selectedDate, 'yyyy-MM-dd') : null),
    [selectedDate],
  );

  const selectedDayEvents = useMemo(() => {
    if (selectedDayKey) {
      return eventsByDay[selectedDayKey] ?? [];
    }
    return events;
  }, [events, eventsByDay, selectedDayKey]);

  const sortedSelectedEvents = useMemo(() => {
    if (selectedDayEvents.length === 0) {
      return [];
    }
    return [...selectedDayEvents].sort(
      (a, b) => eventDateTimeToDate(a.start).getTime() - eventDateTimeToDate(b.start).getTime(),
    );
  }, [selectedDayEvents]);

  const hasSelectedDayEvents = sortedSelectedEvents.length > 0;
  const selectedDateLabel = selectedDate ? formatDate(selectedDate, 'PPP') : null;

  const handleBeginConnect = async () => {
    if (!connectConfig.clientId || !connectConfig.clientSecret || !connectConfig.redirectUri) {
      toast.error('Client ID, secret, and redirect URI are required.');
      return;
    }

    try {
      await beginConnect(connectConfig);
      setConnectOpen(false);
    } catch {
      // errors handled in store
    }
  };

  const handleCompleteConnect = async () => {
    if (!authCode.trim()) {
      toast.error('Paste the authorization code from the provider.');
      return;
    }

    try {
      await completeConnect(authCode.trim());
      setAuthCode('');
    } catch {
      // handled upstream
    }
  };

  const handleRefresh = async () => {
    await refreshAccounts();
    if (selectedAccountId && selectedCalendarId) {
      await refreshEvents();
    }
  };

  const resetEventDialog = () => {
    setEditingEvent(null);
    setEventForm(createDefaultForm());
  };

  const renderEventTime = (dateTime: EventDateTime): string => {
    if (dateTime.kind === 'date') {
      return dateTime.date;
    }
    const date = new Date(dateTime.date_time);
    return date.toLocaleString();
  };

  const handleOpenCreate = () => {
    if (!selectedCalendarId) {
      toast.error('Select a calendar before creating events.');
      return;
    }
    resetEventDialog();
    setEventDialogOpen(true);
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    const eventStartDate = eventDateTimeToDate(event.start);
    setSelectedDate(eventStartDate);
    setViewDate(eventStartDate);
    setEventForm({
      title: event.title,
      description: event.description ?? '',
      location: event.location ?? '',
      start: eventDateTimeToLocalInput(event.start),
      end: eventDateTimeToLocalInput(event.end),
    });
    setEventDialogOpen(true);
  };

  const handleEventSubmit = async () => {
    if (!selectedCalendarId) {
      toast.error('Select a calendar before creating events.');
      return;
    }

    if (!eventForm.title.trim()) {
      toast.error('Event title is required.');
      return;
    }

    if (!eventForm.start || !eventForm.end) {
      toast.error('Start and end times are required.');
      return;
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const startIso = new Date(eventForm.start).toISOString();
    const endIso = new Date(eventForm.end).toISOString();
    const descriptionValue = eventForm.description.trim();
    const locationValue = eventForm.location.trim();

    try {
      if (editingEvent) {
        await updateEvent(editingEvent.calendar_id, editingEvent.id, {
          title: eventForm.title.trim(),
          description: descriptionValue === '' ? null : descriptionValue,
          location: locationValue === '' ? null : locationValue,
          start: { kind: 'dateTime', date_time: startIso, timezone },
          end: { kind: 'dateTime', date_time: endIso, timezone },
        });
      } else {
        await createEvent({
          calendar_id: selectedCalendarId,
          title: eventForm.title.trim(),
          description: descriptionValue === '' ? null : descriptionValue,
          location: locationValue === '' ? null : locationValue,
          start: { kind: 'dateTime', date_time: startIso, timezone },
          end: { kind: 'dateTime', date_time: endIso, timezone },
          attendees: [],
          reminders: [],
          recurrence: null,
        });
      }
      setEventDialogOpen(false);
      resetEventDialog();
    } catch {
      // errors handled in store
    }
  };

  // Updated Nov 16, 2025: Use accessible ConfirmDialog instead of window.confirm
  const handleDeleteEvent = async (event: CalendarEvent) => {
    const confirmed = await confirm({
      title: 'Delete event?',
      description: `Are you sure you want to delete "${event.title}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });

    if (!confirmed) {
      return;
    }
    try {
      await deleteEvent(event.calendar_id, event.id);
    } catch {
      // store handles error
    }
  };

  const handleSelectDate = useCallback((date: Date) => {
    setSelectedDate(date);
    setViewDate(date);
  }, []);

  const handleChangeMonth = useCallback((date: Date) => {
    setViewDate(date);
  }, []);

  return (
    <div className={cn('flex h-full bg-background', className)}>
      <aside className="w-72 border-r border-border/80 bg-muted/10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold leading-tight">Calendar Accounts</p>
              <p className="text-xs text-muted-foreground">Manage providers & schedules</p>
            </div>
          </div>
          <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Connect Calendar Provider</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground">
                    Provider
                  </label>
                  <select
                    value={connectConfig.provider}
                    onChange={(event) =>
                      setConnectConfig((prev) => ({
                        ...prev,
                        provider: event.target.value as CalendarProvider,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">
                      Client ID
                    </label>
                    <Input
                      value={connectConfig.clientId}
                      onChange={(event) =>
                        setConnectConfig((prev) => ({ ...prev, clientId: event.target.value }))
                      }
                      placeholder="OAuth client ID"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">
                      Client Secret
                    </label>
                    <Input
                      type="password"
                      value={connectConfig.clientSecret}
                      onChange={(event) =>
                        setConnectConfig((prev) => ({ ...prev, clientSecret: event.target.value }))
                      }
                      placeholder="OAuth client secret"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">
                      Redirect URI
                    </label>
                    <Input
                      value={connectConfig.redirectUri}
                      onChange={(event) =>
                        setConnectConfig((prev) => ({ ...prev, redirectUri: event.target.value }))
                      }
                      placeholder="http://localhost:5173/auth/callback"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  After clicking connect we will open the authorization page in your browser.
                  Complete the prompt and copy the verification code to finish connecting.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConnectOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleBeginConnect} disabled={loading}>
                  Connect
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="border-t border-border/80 px-3 py-3">
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="w-full">
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
        <div className="border-t border-border/80 px-3 py-2">
          {accounts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 px-3 py-4 text-xs text-muted-foreground">
              Connect a calendar provider to begin.
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => (
                <button
                  key={account.account_id}
                  type="button"
                  onClick={() => selectAccount(account.account_id)}
                  className={cn(
                    'w-full rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-muted/40',
                    account.account_id === selectedAccountId &&
                      'border-primary/70 bg-primary/10 text-primary',
                  )}
                >
                  <p className="text-sm font-semibold leading-tight">
                    {account.display_name ?? account.email ?? account.account_id}
                  </p>
                  <p className="text-xs text-muted-foreground">{account.provider}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        {pendingAuth && (
          <div className="border-t border-border/80 px-3 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Complete Connection
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Paste the authorization code from the provider to finish connecting.
            </p>
            <Input
              value={authCode}
              onChange={(event) => setAuthCode(event.target.value)}
              placeholder="Authorization code"
              className="mt-2"
            />
            <Button onClick={handleCompleteConnect} className="mt-2 w-full">
              Finish Connection
            </Button>
          </div>
        )}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border/80 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Schedules</p>
              <p className="text-xs text-muted-foreground">
                {selectedAccount
                  ? `Synced with ${selectedAccount.display_name ?? selectedAccount.email ?? selectedAccount.account_id}`
                  : 'Select an account to view calendars.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {selectedCalendar && (
                <div className="rounded-md border border-border/70 px-3 py-1 text-xs text-muted-foreground">
                  Viewing {selectedCalendar.name}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenCreate}
                disabled={!selectedCalendarId}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Event
              </Button>
              <Button variant="outline" size="sm" onClick={() => refreshEvents()}>
                <CalendarRange className="mr-2 h-4 w-4" />
                Refresh Events
              </Button>
            </div>
          </div>
        </header>
        <div className="grid flex-1 grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-r border-border/80">
            <ScrollArea className="h-full">
              <div className="space-y-2 px-3 py-3">
                {calendars.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/60 px-3 py-4 text-xs text-muted-foreground">
                    No calendars available.
                  </div>
                ) : (
                  calendars.map((calendar) => (
                    <button
                      key={calendar.id}
                      type="button"
                      onClick={() => selectCalendar(calendar.id)}
                      className={cn(
                        'w-full rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-muted/40',
                        calendar.id === selectedCalendarId &&
                          'border-primary/70 bg-primary/10 text-primary',
                      )}
                    >
                      <p className="text-sm font-semibold">{calendar.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {calendar.timezone} • {calendar.access_role}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </aside>
          <section className="flex min-w-0 flex-1 flex-col">
            <CalendarMonthView
              currentMonth={viewDate}
              onChangeMonth={handleChangeMonth}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              eventsByDay={eventsByDay}
            />
            <div className="flex-1 border-t border-border/80">
              {events.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                  <Calendar className="h-12 w-12 opacity-30" />
                  <p className="mt-2 text-sm">No events scheduled for this calendar.</p>
                </div>
              ) : hasSelectedDayEvents ? (
                <ScrollArea className="h-full">
                  <div className="space-y-3 px-4 py-4">
                    {sortedSelectedEvents.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-md border border-border/70 bg-background px-4 py-3 shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">{event.title}</p>
                          <div className="flex items-center gap-1">
                            {event.meeting_url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs"
                                onClick={() => open(event.meeting_url!)}
                              >
                                <Link className="mr-2 h-3 w-3" />
                                Join
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground"
                              onClick={() => handleEditEvent(event)}
                              title="Edit event"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => handleDeleteEvent(event)}
                              title="Delete event"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {renderEventTime(event.start)} - {renderEventTime(event.end)}
                        </p>
                        {event.location && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Location: {event.location}
                          </p>
                        )}
                        {event.description && (
                          <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                            {event.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                  <Calendar className="h-12 w-12 opacity-30" />
                  <p className="mt-2 text-sm">
                    {selectedDateLabel
                      ? `No events on ${selectedDateLabel}.`
                      : 'Select a date to view events.'}
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
      <Dialog
        open={eventDialogOpen}
        onOpenChange={(open) => {
          setEventDialogOpen(open);
          if (!open) {
            resetEventDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Edit Event' : 'Create Event'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Title</label>
              <Input
                value={eventForm.title}
                onChange={(event) =>
                  setEventForm((prev) => ({ ...prev, title: event.target.value }))
                }
                placeholder="Event title"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Starts</label>
                <Input
                  type="datetime-local"
                  value={eventForm.start}
                  onChange={(event) =>
                    setEventForm((prev) => ({ ...prev, start: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Ends</label>
                <Input
                  type="datetime-local"
                  value={eventForm.end}
                  onChange={(event) =>
                    setEventForm((prev) => ({ ...prev, end: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Location</label>
              <Input
                value={eventForm.location}
                onChange={(event) =>
                  setEventForm((prev) => ({ ...prev, location: event.target.value }))
                }
                placeholder="Optional location"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">Description</label>
              <Textarea
                value={eventForm.description}
                onChange={(event) =>
                  setEventForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Details, agenda, notes..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEventDialogOpen(false);
                resetEventDialog();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleEventSubmit}>
              {editingEvent ? 'Save Changes' : 'Create Event'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Updated Nov 16, 2025: Render accessible dialogs */}
      {confirmDialog}
    </div>
  );
}

export default CalendarWorkspace;
