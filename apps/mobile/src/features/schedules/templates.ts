import type { Schedule } from './store';
import { DEFAULT_AUTO_MODE_ID } from '@/lib/models';

export interface ScheduleTemplate {
  id: string;
  emoji: string;
  title: string;
  description: string;
  initialData: Pick<Schedule, 'name' | 'prompt' | 'model' | 'recurrence' | 'timeOfDay'> &
    Partial<Pick<Schedule, 'daysOfWeek' | 'dayOfMonth'>>;
}

export const SCHEDULE_TEMPLATES: readonly ScheduleTemplate[] = [
  {
    id: 'daily-focus',
    emoji: '🌅',
    title: 'Daily focus',
    description: 'Start the day with priorities, risks, and a concrete first action.',
    initialData: {
      name: 'Daily focus',
      prompt:
        'Create a concise plan for today with three priorities, one risk to watch, and the first concrete action. If there is not enough context, provide a short fill-in template instead of inventing details.',
      model: DEFAULT_AUTO_MODE_ID,
      recurrence: 'daily',
      timeOfDay: '09:00',
    },
  },
  {
    id: 'monday-kickoff',
    emoji: '🗓️',
    title: 'Monday kickoff',
    description: 'Set a focused weekly outcome and turn it into manageable steps.',
    initialData: {
      name: 'Monday kickoff',
      prompt:
        'Create a weekly kickoff worksheet with one desired outcome, the five most useful steps, likely blockers, and a clear definition of done. Mark any missing context as a question for me.',
      model: DEFAULT_AUTO_MODE_ID,
      recurrence: 'weekly',
      daysOfWeek: [1],
      timeOfDay: '09:00',
    },
  },
  {
    id: 'weekly-reflection',
    emoji: '🧭',
    title: 'Weekly reflection',
    description: 'Review progress, lessons, and the next improvement to try.',
    initialData: {
      name: 'Weekly reflection',
      prompt:
        'Guide me through a concise weekly reflection: what moved forward, what stalled, what I learned, and the single improvement to try next week. Use questions when the task has no supporting context.',
      model: DEFAULT_AUTO_MODE_ID,
      recurrence: 'weekly',
      daysOfWeek: [5],
      timeOfDay: '16:00',
    },
  },
  {
    id: 'monthly-review',
    emoji: '📈',
    title: 'Monthly review',
    description: 'Close the month with a lightweight review and next-month plan.',
    initialData: {
      name: 'Monthly review',
      prompt:
        'Prepare a monthly review worksheet covering outcomes, unfinished work, lessons, risks, and three priorities for next month. Clearly label any section that needs information from me.',
      model: DEFAULT_AUTO_MODE_ID,
      recurrence: 'monthly',
      dayOfMonth: 1,
      timeOfDay: '09:00',
    },
  },
] as const;

export function getScheduleTemplate(
  id: string | string[] | undefined,
): ScheduleTemplate | undefined {
  if (typeof id !== 'string') return undefined;
  return SCHEDULE_TEMPLATES.find((template) => template.id === id);
}
