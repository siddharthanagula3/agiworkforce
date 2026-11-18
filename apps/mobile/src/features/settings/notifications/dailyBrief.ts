import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  MANAGED_CLOUD_SCHEDULE_DEFAULT_SOURCES,
  MANAGED_CLOUD_SCHEDULE_TEMPLATES,
  ManagedCloudScheduleResponseSchema,
  managedCloudSchedulePath,
  type ManagedCloudScheduleSources,
} from '@agiworkforce/cloud-contracts';
import { getPlanMaxScheduledTasks } from '@agiworkforce/types';

import { DEFAULT_AUTO_MODE_ID } from '@/lib/models';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';
import {
  createSchedule,
  deleteSchedule,
  toggleSchedule,
  updateSchedule,
} from '@/src/features/schedules/service';
import type { CreateScheduleInput } from '@/src/features/schedules/store';
import { fetchWorkspaceOverview } from '@/src/features/team/service';

export const DAILY_BRIEF_SCHEDULE_PREFERENCE_KEY = 'dailyBriefScheduleId';
export const DAILY_BRIEF_DEFAULT_TIME = '08:00';
export const DAILY_BRIEF_NAME = 'Daily brief';
export const DAILY_BRIEF_DESCRIPTION =
  'A short morning summary of your calendar, email and recent chats.';
export const DAILY_BRIEF_SETUP_FAILED = 'Could not set up the daily brief.';
export const DAILY_BRIEF_PAUSE_FAILED = 'Could not pause the daily brief.';
export const DAILY_BRIEF_TIME_FAILED = 'Could not change the daily brief time.';

const DAILY_BRIEF_TEMPLATE_ID = 'daily-briefing';

export interface DailyBriefState {
  scheduleId: string | null;
  enabled: boolean;
  timeOfDay: string;
  elsewhere?: string;
}

export interface DailyBriefScope {
  personalLabel: string;
  signal?: AbortSignal;
}

export const DAILY_BRIEF_OFF: DailyBriefState = {
  scheduleId: null,
  enabled: false,
  timeOfDay: DAILY_BRIEF_DEFAULT_TIME,
};

type DailyBriefScheduleInput = CreateScheduleInput & { sources: ManagedCloudScheduleSources };

export function dailyBriefAvailable(planTier: string | null | undefined): boolean {
  return FEATURES.schedules && getPlanMaxScheduledTasks(planTier) !== 0;
}

function dailyBriefTemplate() {
  const template = MANAGED_CLOUD_SCHEDULE_TEMPLATES.find(
    (candidate) => candidate.id === DAILY_BRIEF_TEMPLATE_ID,
  );
  if (!template) throw new Error('The daily brief template is missing.');
  return template.draft;
}

export function dailyBriefScheduleInput(
  timeOfDay: string,
  timezone: string,
): DailyBriefScheduleInput {
  const draft = dailyBriefTemplate();
  return {
    name: DAILY_BRIEF_NAME,
    prompt: draft.prompt,
    model: DEFAULT_AUTO_MODE_ID,
    recurrence: 'daily',
    scheduledAt: null,
    timeOfDay,
    timezone,
    isActive: true,
    connectors: null,
    sources: draft.sources ?? { ...MANAGED_CLOUD_SCHEDULE_DEFAULT_SOURCES },
  };
}

function isMissing(error: unknown): boolean {
  return error instanceof ApiHttpError && error.status === 404;
}

export function readDailyBriefScheduleId(settings: unknown): string | null {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const id = (settings as Record<string, unknown>)[DAILY_BRIEF_SCHEDULE_PREFERENCE_KEY];
  return typeof id === 'string' && id.trim() !== '' ? id : null;
}

async function readSchedule(scheduleId: string, signal?: AbortSignal, workspaceSelector?: string) {
  const value = await api.get<unknown>(managedCloudSchedulePath(scheduleId), {
    ...(signal ? { signal } : {}),
    ...(workspaceSelector
      ? { headers: { [MANAGED_CLOUD_ORGANIZATION_HEADER]: workspaceSelector } }
      : {}),
  });
  const parsed = ManagedCloudScheduleResponseSchema.safeParse(value);
  if (!parsed.success) throw new Error('The daily brief returned an invalid response.');
  return parsed.data.schedule;
}

export async function locateDailyBriefElsewhere(
  scheduleId: string,
  scope: DailyBriefScope,
): Promise<string | null> {
  const overview = await fetchWorkspaceOverview(scope.signal);
  if (overview.workspaces.length === 0) return null;
  const candidates = [
    { selector: MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE, name: scope.personalLabel },
    ...overview.workspaces.map((membership) => ({
      selector: membership.id,
      name: membership.name,
    })),
  ];
  for (const candidate of candidates) {
    try {
      await readSchedule(scheduleId, scope.signal, candidate.selector);
      return candidate.name;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  return null;
}

function offElsewhere(timeOfDay: string, elsewhere: string | null): DailyBriefState {
  return { ...DAILY_BRIEF_OFF, timeOfDay, ...(elsewhere ? { elsewhere } : {}) };
}

export async function readDailyBrief(
  scheduleId: string | null,
  scope: DailyBriefScope,
): Promise<DailyBriefState> {
  if (!scheduleId) return DAILY_BRIEF_OFF;
  let schedule: Awaited<ReturnType<typeof readSchedule>>;
  try {
    schedule = await readSchedule(scheduleId, scope.signal);
  } catch (error) {
    if (!isMissing(error)) throw error;
    return offElsewhere(
      DAILY_BRIEF_DEFAULT_TIME,
      await locateDailyBriefElsewhere(scheduleId, scope),
    );
  }
  const timeOfDay = schedule.metadata?.['timeOfDay'];
  return {
    scheduleId: schedule.id,
    enabled: schedule.isEnabled && schedule.status === 'active',
    timeOfDay: typeof timeOfDay === 'string' ? timeOfDay : DAILY_BRIEF_DEFAULT_TIME,
  };
}

export interface DailyBriefWrites {
  rememberScheduleId: (scheduleId: string) => Promise<void>;
}

async function createDailyBrief(
  timeOfDay: string,
  timezone: string,
  writes: DailyBriefWrites,
): Promise<DailyBriefState> {
  const created = await createSchedule(dailyBriefScheduleInput(timeOfDay, timezone));
  try {
    await writes.rememberScheduleId(created.id);
  } catch (error) {
    await deleteSchedule(created.id).catch(() => undefined);
    throw error;
  }
  return { scheduleId: created.id, enabled: created.isActive, timeOfDay: created.timeOfDay };
}

export async function turnOnDailyBrief(
  current: DailyBriefState,
  timeOfDay: string,
  timezone: string,
  writes: DailyBriefWrites,
  scope: DailyBriefScope,
): Promise<DailyBriefState> {
  if (current.elsewhere) return current;
  if (current.scheduleId) {
    try {
      const resumed = await updateSchedule(current.scheduleId, {
        timeOfDay,
        timezone,
        isActive: true,
      });
      return { scheduleId: resumed.id, enabled: resumed.isActive, timeOfDay: resumed.timeOfDay };
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const elsewhere = await locateDailyBriefElsewhere(current.scheduleId, scope);
    if (elsewhere) return offElsewhere(current.timeOfDay, elsewhere);
  }
  return createDailyBrief(timeOfDay, timezone, writes);
}

export async function turnOffDailyBrief(
  current: DailyBriefState,
  scope: DailyBriefScope,
): Promise<DailyBriefState> {
  if (!current.scheduleId) return { ...current, enabled: false };
  try {
    const paused = await toggleSchedule(current.scheduleId, false);
    return { scheduleId: paused.id, enabled: paused.isActive, timeOfDay: paused.timeOfDay };
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  return offElsewhere(
    current.timeOfDay,
    await locateDailyBriefElsewhere(current.scheduleId, scope),
  );
}
