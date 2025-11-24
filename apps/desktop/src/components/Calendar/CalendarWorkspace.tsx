// Updated Nov 16, 2025: Added accessible dialogs to replace window.confirm
import { format as formatDate } from 'date-fns';
import {
  Calendar,
  CalendarRange,
  ChevronRight,
  LayoutGrid,
  List,
  Plus,
  RefreshCcw,
  Rows,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { cn } from '../../lib/utils';
import { useCalendarStore, type CalendarConnectConfig } from '../../stores/calendarStore';
import type {
  CalendarEvent,
  CalendarProvider,
  CreateEventRequest,
  UpdateEventRequest,
} from '../../types/calendar';
import { Button } from '../ui/Button';
import { useConfirm } from '../ui/ConfirmDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Tabs, TabsList, TabsTrigger } from '../ui/Tabs';
import CalendarDayView from './CalendarDayView';
import CalendarMonthView from './CalendarMonthView';
import CalendarWeekView from './CalendarWeekView';
import { EventDialog } from './EventDialog';

interface CalendarWorkspaceProps {
  className?: string;
}

const PROVIDER_OPTIONS = [
  { value: 'google' as const, label: 'Google Calendar' },
  { value: 'outlook' as const, label: 'Microsoft Outlook' },
];

type CalendarView = 'month' | 'week' | 'day';

export function CalendarWorkspace({ className }: CalendarWorkspaceProps) {
  const {
    accounts,
    calendars,
    events,
    selectedAccountId,
    selectedCalendarId,
    loading,
    // error,
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
  const [currentView, setCurrentView] = useState<CalendarView>('month');
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Updated Nov 16, 2025: Use accessible dialogs
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Group events by day for month/week views
  const eventsByDay = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {};
    events.forEach((event) => {
      const dateKey =
        event.start.kind === 'dateTime' ? event.start.date_time.split('T')[0] : event.start.date;

      if (!dateKey) return;

      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(event);
    });
    return grouped;
  }, [events]);

  // Filter events for day view
  const dayEvents = useMemo(() => {
    const dateKey = formatDate(viewDate, 'yyyy-MM-dd');
    return eventsByDay[dateKey] || [];
  }, [eventsByDay, viewDate]);

  const handleConnect = async () => {
    if (!connectConfig.clientId || !connectConfig.clientSecret || !connectConfig.redirectUri) {
      toast.error('Client ID, secret, and redirect URI are required.');
      return;
    }

    try {
      await beginConnect(connectConfig);
      // await open(url); // Handled by store
    } catch (err) {
      toast.error('Failed to start connection flow');
    }
  };

  const handleCompleteConnect = async () => {
    if (!authCode.trim()) {
      toast.error('Paste the authorization code from the provider.');
      return;
    }

    try {
      await completeConnect(authCode.trim());
      setConnectOpen(false);
      setAuthCode('');
      toast.success('Calendar connected successfully');
    } catch (err) {
      toast.error('Failed to complete connection');
    }
  };

  const handleCreateEvent = async (data: CreateEventRequest | UpdateEventRequest) => {
    try {
      if (selectedEvent) {
        await updateEvent(selectedEvent.calendar_id, selectedEvent.id, data as UpdateEventRequest);
        toast.success('Event updated');
      } else {
        if (!selectedCalendarId) {
          toast.error('Select a calendar before creating events.');
          return;
        }
        await createEvent({ ...(data as CreateEventRequest), calendar_id: selectedCalendarId });
        toast.success('Event created');
      }
      setEventDialogOpen(false);
      setSelectedEvent(null);
      refreshEvents();
    } catch (err) {
      toast.error('Failed to save event');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const confirmed = await confirm({
      title: 'Delete event?',
      description: `Are you sure you want to delete this event? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });

    if (!confirmed) {
      return;
    }

    try {
      if (selectedCalendarId) {
        await deleteEvent(selectedCalendarId, eventId);
        toast.success('Event deleted');
        setEventDialogOpen(false);
        setSelectedEvent(null);
        refreshEvents();
      } else {
        toast.error('No calendar selected to delete event from.');
      }
    } catch (err) {
      toast.error('Failed to delete event');
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setEventDialogOpen(true);
  };

  const handleNewEvent = () => {
    setSelectedEvent(null);
    setEventDialogOpen(true);
  };

  // Initial load
  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  // Load events when calendar changes
  useEffect(() => {
    if (selectedCalendarId) {
      // Load a wide range around current view
      const start = new Date(viewDate);
      start.setMonth(start.getMonth() - 1);
      const end = new Date(viewDate);
      end.setMonth(end.getMonth() + 2); // Load next 2 months

      refreshEvents({
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });
    }
  }, [selectedCalendarId, viewDate, refreshEvents]);

  if (!selectedAccountId) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center p-8 text-center',
          className,
        )}
      >
        <div className="mb-6 rounded-full bg-primary/10 p-6">
          <CalendarRange className="h-12 w-12 text-primary" />
        </div>
        <h2 className="mb-2 text-2xl font-bold">Connect Your Calendar</h2>
        <p className="mb-8 max-w-md text-muted-foreground">
          Connect your Google or Outlook calendar to manage events, schedule meetings, and stay
          organized directly from AGI Workforce.
        </p>

        <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
          <DialogTrigger asChild>
            <Button size="lg">
              <Plus className="mr-2 h-5 w-5" />
              Add Calendar Account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect Calendar Account</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Provider</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={connectConfig.provider}
                  onChange={(e) =>
                    setConnectConfig({
                      ...connectConfig,
                      provider: e.target.value as CalendarProvider,
                    })
                  }
                >
                  {PROVIDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {!pendingAuth ? (
                <>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Client ID</label>
                    <Input
                      value={connectConfig.clientId}
                      onChange={(e) =>
                        setConnectConfig({ ...connectConfig, clientId: e.target.value })
                      }
                      placeholder="OAuth Client ID"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Client Secret</label>
                    <Input
                      type="password"
                      value={connectConfig.clientSecret}
                      onChange={(e) =>
                        setConnectConfig({ ...connectConfig, clientSecret: e.target.value })
                      }
                      placeholder="OAuth Client Secret"
                    />
                  </div>
                  <Button
                    onClick={handleConnect}
                    disabled={!connectConfig.clientId || !connectConfig.clientSecret}
                  >
                    Start Connection
                  </Button>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-md bg-muted p-4 text-sm">
                    Please complete the authentication in your browser, then paste the authorization
                    code below.
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Authorization Code</label>
                    <Input
                      value={authCode}
                      onChange={(e) => setAuthCode(e.target.value)}
                      placeholder="Paste code here"
                    />
                  </div>
                  <Button onClick={handleCompleteConnect} disabled={!authCode}>
                    Complete Connection
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {accounts.length > 0 && (
          <div className="mt-8 w-full max-w-md">
            <h3 className="mb-4 text-sm font-medium text-muted-foreground">Connected Accounts</h3>
            <div className="space-y-2">
              {accounts.map((account) => (
                <button
                  key={account.account_id}
                  onClick={() => selectAccount(account.account_id)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                      <Calendar className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium">{account.display_name || account.email}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {account.provider}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-background px-4 py-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedAccountId || ''}
              onChange={(e) => selectAccount(e.target.value)}
            >
              {accounts.map((acc) => (
                <option key={acc.account_id} value={acc.account_id}>
                  {acc.display_name || acc.email}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedCalendarId || ''}
              onChange={(e) => selectCalendar(e.target.value)}
            >
              {calendars.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.name}
                </option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-border" />

          <Tabs value={currentView} onValueChange={(v) => setCurrentView(v as CalendarView)}>
            <TabsList className="h-8">
              <TabsTrigger value="month" className="h-7 px-3 text-xs">
                <LayoutGrid className="mr-2 h-3.5 w-3.5" />
                Month
              </TabsTrigger>
              <TabsTrigger value="week" className="h-7 px-3 text-xs">
                <List className="mr-2 h-3.5 w-3.5" />
                Week
              </TabsTrigger>
              <TabsTrigger value="day" className="h-7 px-3 text-xs">
                <Rows className="mr-2 h-3.5 w-3.5" />
                Day
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refreshEvents()}
            disabled={loading}
            title="Refresh events"
          >
            <RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button onClick={handleNewEvent} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Event
          </Button>
        </div>
      </div>

      {/* Main View */}
      <div className="flex-1 overflow-hidden">
        {currentView === 'month' && (
          <CalendarMonthView
            currentMonth={viewDate}
            onChangeMonth={setViewDate}
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setViewDate(date);
            }}
            eventsByDay={eventsByDay}
          />
        )}
        {currentView === 'week' && (
          <CalendarWeekView
            currentDate={viewDate}
            onChangeDate={setViewDate}
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setViewDate(date);
            }}
            eventsByDay={eventsByDay}
            onEventClick={handleEventClick}
          />
        )}
        {currentView === 'day' && (
          <CalendarDayView
            currentDate={viewDate}
            onChangeDate={setViewDate}
            events={dayEvents}
            onEventClick={handleEventClick}
          />
        )}
      </div>

      {/* Event Dialog */}
      {selectedCalendarId && (
        <EventDialog
          open={eventDialogOpen}
          onOpenChange={setEventDialogOpen}
          selectedDate={selectedDate}
          existingEvent={selectedEvent}
          onSave={handleCreateEvent}
          onDelete={handleDeleteEvent}
          calendarId={selectedCalendarId}
        />
      )}

      {confirmDialog}
    </div>
  );
}

export default CalendarWorkspace;
