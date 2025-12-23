import { useMemo } from 'react';
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import type { CalendarEvent } from '../../types/calendar';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface CalendarMonthViewProps {
  currentMonth: Date;
  onChangeMonth: (date: Date) => void;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  eventsByDay: Record<string, CalendarEvent[]>;
}

export function CalendarMonthView({
  currentMonth,
  onChangeMonth,
  selectedDate,
  onSelectDate,
  eventsByDay,
}: CalendarMonthViewProps) {
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days: Date[] = [];
    let cursor = gridStart;
    while (cursor <= gridEnd) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }

    return days;
  }, [currentMonth]);

  return (
    <div className="flex flex-col border-b border-border/80 bg-muted/5">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{format(currentMonth, 'MMMM yyyy')}</p>
          <p className="text-xs text-muted-foreground">
            {format(startOfMonth(currentMonth), 'MMM d')} –{' '}
            {format(endOfMonth(currentMonth), 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChangeMonth(subMonths(currentMonth, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChangeMonth(addMonths(currentMonth, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onChangeMonth(new Date())}>
            Today
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-t border-border/60 text-xs text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-1 text-center font-medium uppercase tracking-wide">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-t border-border/60">
        {calendarDays.map((day) => {
          const dayKey = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDay[dayKey] ?? [];
          const isInMonth = isSameMonth(day, currentMonth);
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDate(day)}
              className={cn(
                'relative h-20 w-full border-b border-r border-border/60 p-2 text-left transition-colors focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary',
                !isInMonth && 'bg-background/70 text-muted-foreground/70',
                isSelected && 'bg-primary/10 ring-1 ring-primary',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                  isToday(day) && 'bg-primary text-primary-foreground',
                  !isToday(day) && isSelected && 'bg-primary/20 text-primary',
                )}
              >
                {format(day, 'd')}
              </span>
              {dayEvents.length > 0 && (
                <div className="mt-2 space-y-1">
                  {dayEvents.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className="truncate rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
                    >
                      {event.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-[11px] text-muted-foreground">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarMonthView;
