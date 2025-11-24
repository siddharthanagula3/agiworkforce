import { format } from 'date-fns';
import { MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';

import type {
  CalendarEvent,
  CreateEventRequest,
  EventDateTime,
  UpdateEventRequest,
} from '../../types/calendar';
import { Button } from '../ui/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Textarea } from '../ui/Textarea';

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: Date | null;
  existingEvent?: CalendarEvent | null;
  onSave: (event: CreateEventRequest | UpdateEventRequest) => Promise<void>;
  onDelete?: (eventId: string) => Promise<void>;
  calendarId: string;
}

export function EventDialog({
  open,
  onOpenChange,
  selectedDate,
  existingEvent,
  onSave,
  onDelete,
  calendarId,
}: EventDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isAllDay, setIsAllDay] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      if (existingEvent) {
        // Edit mode
        setTitle(existingEvent.title);
        setDescription(existingEvent.description || '');
        setLocation(existingEvent.location || '');

        const start =
          existingEvent.start.kind === 'dateTime'
            ? new Date(existingEvent.start.date_time)
            : new Date(existingEvent.start.date);

        const end =
          existingEvent.end.kind === 'dateTime'
            ? new Date(existingEvent.end.date_time)
            : new Date(existingEvent.end.date);

        setStartDate(format(start, 'yyyy-MM-dd'));
        setStartTime(format(start, 'HH:mm'));
        setEndDate(format(end, 'yyyy-MM-dd'));
        setEndTime(format(end, 'HH:mm'));
        setIsAllDay(existingEvent.start.kind === 'date');
      } else {
        // Create mode
        const baseDate = selectedDate || new Date();
        setTitle('');
        setDescription('');
        setLocation('');
        setStartDate(format(baseDate, 'yyyy-MM-dd'));

        // Default to next hour
        const now = new Date();
        const nextHour = new Date(now);
        nextHour.setHours(now.getHours() + 1, 0, 0, 0);
        setStartTime(format(nextHour, 'HH:mm'));

        setEndDate(format(baseDate, 'yyyy-MM-dd'));
        const endHour = new Date(nextHour);
        endHour.setHours(nextHour.getHours() + 1);
        setEndTime(format(endHour, 'HH:mm'));
        setIsAllDay(false);
      }
    }
  }, [open, existingEvent, selectedDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const start: EventDateTime = isAllDay
        ? { kind: 'date', date: startDate }
        : {
            kind: 'dateTime',
            date_time: `${startDate}T${startTime}:00`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };

      const end: EventDateTime = isAllDay
        ? { kind: 'date', date: endDate }
        : {
            kind: 'dateTime',
            date_time: `${endDate}T${endTime}:00`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };

      const eventData = {
        title,
        description: description || null,
        location: location || null,
        start,
        end,
        calendar_id: calendarId,
        attendees: [], // TODO: Add attendee support
        reminders: [], // TODO: Add reminder support
      };

      await onSave(eventData);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save event:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!existingEvent || !onDelete) return;

    if (window.confirm('Are you sure you want to delete this event?')) {
      setLoading(true);
      try {
        await onDelete(existingEvent.id);
        onOpenChange(false);
      } catch (error) {
        console.error('Failed to delete event:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{existingEvent ? 'Edit Event' : 'New Event'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
                {!isAllDay && (
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>End</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
                {!isAllDay && (
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDay"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="allDay" className="font-normal">
              All day
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Add location"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              rows={3}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {existingEvent && onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={loading}
                className="mr-auto"
              >
                Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
