import {
  MANAGED_CLOUD_SCHEDULE_TEMPLATES,
  type ManagedCloudScheduleTemplate,
} from '@agiworkforce/cloud-contracts';
import type { Schedule } from './store';
import { DEFAULT_AUTO_MODE_ID } from '@/lib/models';

export interface ScheduleTemplate {
  id: string;
  emoji: string;
  title: string;
  description: string;
  cadenceLabel: string;
  initialData: Pick<Schedule, 'name' | 'prompt' | 'model' | 'recurrence' | 'timeOfDay'> &
    Partial<Pick<Schedule, 'daysOfWeek' | 'dayOfMonth'>>;
}

const TEMPLATE_EMOJI: Readonly<Record<string, string>> = {
  'weekly-review': '📝',
  'meeting-prep': '🗓️',
  'inbox-triage': '📥',
  'content-ideas': '💡',
  'daily-briefing': '🌅',
  'monitor-topic': '🔎',
};

const FALLBACK_TEMPLATE_EMOJI = '📅';

function toScheduleTemplate(template: ManagedCloudScheduleTemplate): ScheduleTemplate {
  const { draft } = template;
  return {
    id: template.id,
    emoji: TEMPLATE_EMOJI[template.id] ?? FALLBACK_TEMPLATE_EMOJI,
    title: template.name,
    description: template.description,
    cadenceLabel: template.cadenceLabel,
    initialData: {
      name: draft.name,
      prompt: draft.prompt,
      model: DEFAULT_AUTO_MODE_ID,
      recurrence: draft.recurrence,
      timeOfDay: draft.timeOfDay,
      ...(draft.daysOfWeek ? { daysOfWeek: [...draft.daysOfWeek] } : {}),
    },
  };
}

export const SCHEDULE_TEMPLATES: readonly ScheduleTemplate[] =
  MANAGED_CLOUD_SCHEDULE_TEMPLATES.map(toScheduleTemplate);

export function getScheduleTemplate(
  id: string | string[] | undefined,
): ScheduleTemplate | undefined {
  if (typeof id !== 'string') return undefined;
  return SCHEDULE_TEMPLATES.find((template) => template.id === id);
}

const DRAFT_NAME_CHARS = 60;

export function scheduleDraftFromPrompt(
  prompt: string,
  model: string | undefined,
): Pick<Schedule, 'name' | 'prompt' | 'model' | 'recurrence' | 'timeOfDay'> {
  const text = prompt.trim();
  const firstLine = text.split('\n', 1)[0]?.trim() ?? '';
  const name =
    firstLine.length > DRAFT_NAME_CHARS
      ? `${firstLine.slice(0, DRAFT_NAME_CHARS - 1).trimEnd()}…`
      : firstLine;
  return {
    name,
    prompt: text,
    model: model ?? DEFAULT_AUTO_MODE_ID,
    recurrence: 'daily',
    timeOfDay: '09:00',
  };
}
