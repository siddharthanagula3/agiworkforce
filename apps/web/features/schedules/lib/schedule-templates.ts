import {
  MANAGED_CLOUD_SCHEDULE_TEMPLATES,
  type ManagedCloudScheduleTemplate,
} from '@agiworkforce/cloud-contracts';
import {
  Bell,
  CalendarCheck,
  CalendarClock,
  FileSearch,
  FileText,
  Inbox,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react';

export type ScheduleTemplate = ManagedCloudScheduleTemplate;

export const SCHEDULE_TEMPLATES: readonly ScheduleTemplate[] = MANAGED_CLOUD_SCHEDULE_TEMPLATES;

const TEMPLATE_ICONS: Readonly<Record<string, LucideIcon>> = {
  'weekly-review': FileText,
  'meeting-prep': CalendarCheck,
  'inbox-triage': Inbox,
  'content-ideas': Lightbulb,
  'daily-briefing': Bell,
  'monitor-topic': FileSearch,
};

export function scheduleTemplateIcon(templateId: string): LucideIcon {
  return TEMPLATE_ICONS[templateId] ?? CalendarClock;
}
