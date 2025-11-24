import { addDays, format, isToday, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { CalendarEvent } from '../../types/calendar';
import { Button } from '../ui/Button';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export interface CalendarDayViewProps {
  currentDate: Date;
  onChangeDate: (date: Date) => void;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

export function CalendarDayView({
  currentDate,
  onChangeDate,
  events,
  onEventClick,
}: CalendarDayViewProps) {
  const getEventStyle = (event: CalendarEvent) => {
    const start = new Date(
      event.start.kind === 'dateTime' ? event.start.date_time : `${event.start.date}T00:00`,
    );
    const end = new Date(
      event.end.kind === 'dateTime' ? event.end.date_time : `${event.end.date}T01:00`,
    );

    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    const duration = Math.max(endHour - startHour, 0.5); // Min 30 mins

    return {
      top: `${startHour * 60}px`,
      height: `${duration * 60}px`,
    };
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <p className="text-sm font-semibold">{format(currentDate, 'MMMM yyyy')}</p>
          <p className="text-xs text-muted-foreground">{format(currentDate, 'EEEE, MMMM d')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChangeDate(subDays(currentDate, 1))}
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChangeDate(addDays(currentDate, 1))}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onChangeDate(new Date())}>
            Today
          </Button>
        </div>
      </div>

      {/* Scrollable Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex relative min-h-[1440px]">
          {/* Time Labels */}
          <div className="w-16 flex-shrink-0 border-r border-border bg-muted/5 flex flex-col text-xs text-muted-foreground">
            {HOURS.map((hour) => (
              <div key={hour} className="h-[60px] border-b border-border/50 px-2 py-1 text-right">
                {format(new Date().setHours(hour, 0), 'h a')}
              </div>
            ))}
          </div>

          {/* Day Column */}
          <div className="flex-1 relative">
            {/* Horizontal Hour Lines */}
            <div className="absolute inset-0 flex flex-col pointer-events-none">
              {HOURS.map((hour) => (
                <div key={hour} className="h-[60px] border-b border-border/50" />
              ))}
            </div>

            {/* Current Time Indicator (if today) */}
            {isToday(currentDate) && (
              <div
                className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                style={{
                  top: `${(new Date().getHours() + new Date().getMinutes() / 60) * 60}px`,
                }}
              >
                <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
              </div>
            )}

            {/* Events */}
            {events.map((event) => (
              <div
                key={event.id}
                className="absolute left-2 right-2 rounded border border-primary/30 bg-primary/20 px-3 py-2 text-sm text-primary overflow-hidden cursor-pointer hover:bg-primary/30 transition-colors z-10"
                style={getEventStyle(event)}
                onClick={(e) => {
                  e.stopPropagation();
                  onEventClick?.(event);
                }}
              >
                <div className="font-semibold">{event.title}</div>
                <div className="text-xs opacity-80">
                  {format(
                    new Date(
                      event.start.kind === 'dateTime' ? event.start.date_time : event.start.date,
                    ),
                    'h:mm a',
                  )}{' '}
                  -
                  {format(
                    new Date(event.end.kind === 'dateTime' ? event.end.date_time : event.end.date),
                    'h:mm a',
                  )}
                </div>
                {event.location && (
                  <div className="text-xs opacity-70 mt-1 truncate">{event.location}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CalendarDayView;
