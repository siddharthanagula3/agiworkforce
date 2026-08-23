import type { ScheduleDraft } from '../types';

export interface ScheduleTemplate {
  id: string;
  name: string;
  cadenceLabel: string;
  description: string;
  /**
   * Overlaid on INITIAL_SCHEDULE_DRAFT, so a template only states what it
   * changes. Every one sets a real recurrence — a template that left the
   * default 'once' would be a "weekly review" that runs a single time.
   */
  draft: Partial<ScheduleDraft>;
}

const WEEKDAYS = [1, 2, 3, 4, 5];

export const SCHEDULE_TEMPLATES: readonly ScheduleTemplate[] = [
  {
    id: 'weekly-review',
    name: 'Weekly review',
    cadenceLabel: 'Fridays at 4:00 PM',
    description: 'Summarise the week and surface what slipped, before you log off.',
    draft: {
      name: 'Weekly review',
      prompt:
        'Write a short review of my week. Cover what got finished, what slipped, and the two or three things that most deserve attention next week. Be concrete and skip filler.',
      recurrence: 'weekly',
      daysOfWeek: [5],
      timeOfDay: '16:00',
    },
  },
  {
    id: 'daily-briefing',
    name: 'Daily briefing',
    cadenceLabel: 'Weekdays at 8:00 AM',
    description: 'A short start-of-day brief so the first thing you read is the plan.',
    draft: {
      name: 'Daily briefing',
      prompt:
        'Give me a brief for today: the few things that matter most, anything time-sensitive, and one thing worth doing early while I have focus. Keep it under 200 words.',
      recurrence: 'weekly',
      daysOfWeek: WEEKDAYS,
      timeOfDay: '08:00',
    },
  },
  {
    id: 'meeting-prep',
    name: 'Meeting prep',
    cadenceLabel: 'Weekdays at 7:30 AM',
    description: 'Questions and context to walk in with, prepared before the day starts.',
    draft: {
      name: 'Meeting prep',
      prompt:
        'Help me prepare for my meetings today. For each, suggest the questions worth asking, the decisions that need making, and anything I should have read first.',
      recurrence: 'weekly',
      daysOfWeek: WEEKDAYS,
      timeOfDay: '07:30',
    },
  },
  {
    id: 'inbox-triage',
    name: 'Inbox triage',
    cadenceLabel: 'Weekdays at 9:00 AM',
    description: 'Sort what needs a reply from what can wait.',
    draft: {
      name: 'Inbox triage',
      prompt:
        'Help me triage my inbox. Separate what genuinely needs a reply today from what can wait, and draft a one-line response for anything routine.',
      recurrence: 'weekly',
      daysOfWeek: WEEKDAYS,
      timeOfDay: '09:00',
    },
  },
  {
    id: 'content-ideas',
    name: 'Content ideas',
    cadenceLabel: 'Mondays at 10:00 AM',
    description: 'A fresh batch of angles to work from at the start of the week.',
    draft: {
      name: 'Content ideas',
      prompt:
        'Suggest five specific things worth writing about this week, based on what I have been working on. For each, give the angle and who it is for — not just a topic.',
      recurrence: 'weekly',
      daysOfWeek: [1],
      timeOfDay: '10:00',
    },
  },
  {
    id: 'monitor-topic',
    name: 'Monitor a topic',
    cadenceLabel: 'Daily at 7:00 AM',
    description: 'Track a subject over time and hear only what actually changed.',
    draft: {
      name: 'Monitor a topic',
      prompt:
        'Track [replace this with the topic you want followed]. Report only what has genuinely changed since the last run, and say plainly when nothing has.',
      recurrence: 'daily',
      timeOfDay: '07:00',
    },
  },
];
