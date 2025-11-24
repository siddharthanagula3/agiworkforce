import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isToday,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '../../lib/utils';
import type { CalendarEvent } from '../../types/calendar';
import { Button } from '../ui/Button';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
// const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface CalendarWeekViewProps {
  currentDate: Date;
  onChangeDate: (date: Date) => void;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  eventsByDay: Record<string, CalendarEvent[]>;
  onEventClick?: (event: CalendarEvent) => void;
}

export function CalendarWeekView({
  currentDate,
  onChangeDate,
  // selectedDate,
  onSelectDate,
  eventsByDay,
  onEventClick,
}: CalendarWeekViewProps) {
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 0 });
    const end = endOfWeek(currentDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

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
          <p className="text-xs text-muted-foreground">
            Week of {format(startOfWeek(currentDate), 'MMM d')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChangeDate(subWeeks(currentDate, 1))}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChangeDate(addWeeks(currentDate, 1))}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onChangeDate(new Date())}>
            Today
          </Button>
        </div>
      </div>

      {/* Grid Header (Days) */}
      <div className="flex border-b border-border">
        <div className="w-16 flex-shrink-0 border-r border-border bg-muted/5" />
        <div className="flex-1 grid grid-cols-7">
          {weekDays.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                'px-2 py-2 text-center border-r border-border last:border-r-0',
                isToday(day) && 'bg-primary/5',
              )}
            >
              <div className="text-xs text-muted-foreground uppercase">{format(day, 'EEE')}</div>
              <div
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium mt-1',
                  isToday(day) ? 'bg-primary text-primary-foreground' : 'text-foreground',
                )}
              >
                {format(day, 'd')}
              </div>
            </div>
          ))}
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

          {/* Days Columns */}
          <div className="flex-1 grid grid-cols-7 relative">
            {/* Horizontal Hour Lines */}
            <div className="absolute inset-0 flex flex-col pointer-events-none">
              {HOURS.map((hour) => (
                <div key={hour} className="h-[60px] border-b border-border/50" />
              ))}
            </div>

            {weekDays.map((day) => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDay[dayKey] ?? [];

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'relative border-r border-border last:border-r-0 h-full',
                    isToday(day) && 'bg-primary/5',
                  )}
                  onClick={() => onSelectDate(day)}
                >
                  {/* Events */}
                  {dayEvents.map((event) => (
                    <div
                      key={event.id}
                      className="absolute left-0.5 right-0.5 rounded border border-primary/30 bg-primary/20 px-2 py-1 text-xs text-primary overflow-hidden cursor-pointer hover:bg-primary/30 transition-colors z-10"
                      style={getEventStyle(event)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick?.(event);
                      }}
                    >
                      <div className="font-semibold truncate">{event.title}</div>
                      <div className="text-[10px] opacity-80 truncate">
                        {format(
                          new Date(
                            event.start.kind === 'dateTime'
                              ? event.start.date_time
                              : event.start.date,
                          ),
                          'h:mm a',
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CalendarWeekView;
