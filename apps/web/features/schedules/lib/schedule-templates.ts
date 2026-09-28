import {
  MANAGED_CLOUD_SCHEDULE_TEMPLATES,
  type ManagedCloudScheduleTemplate,
} from '@agiworkforce/cloud-contracts';

export type ScheduleTemplate = ManagedCloudScheduleTemplate;

export const SCHEDULE_TEMPLATES: readonly ScheduleTemplate[] = MANAGED_CLOUD_SCHEDULE_TEMPLATES;
