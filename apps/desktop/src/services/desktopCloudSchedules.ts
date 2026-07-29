import {
  createManagedCloudSchedulesClient,
  type ManagedCloudScheduleMutation,
  type ManagedCloudScheduleRun,
  type ManagedCloudScheduleTask,
  type ManagedCloudSchedulesPageInput,
} from '@agiworkforce/cloud-contracts';
import { CLOUD_API_BASE_URL, cloudFetch } from '../api/cloudApi';
import { assertManagedCloudBoundary, captureManagedCloudBoundary } from './managedCloudBoundary';

const client = createManagedCloudSchedulesClient({
  baseUrl: CLOUD_API_BASE_URL,
  fetchImpl: cloudFetch,
});

async function withinManagedBoundary<T>(label: string, operation: () => Promise<T>): Promise<T> {
  const boundary = captureManagedCloudBoundary(label);
  const result = await operation();
  assertManagedCloudBoundary(boundary);
  return result;
}

/**
 * Desktop adapter for account-owned, durable Managed Cloud schedules.
 *
 * This deliberately never calls the Tauri scheduler: Local schedules and
 * Cloud schedules are separate trust boundaries with separate persistence.
 */
export const desktopCloudSchedules = {
  listSchedules(input: ManagedCloudSchedulesPageInput) {
    return withinManagedBoundary('Managed Cloud schedule list', () => client.listSchedules(input));
  },

  getSchedule(scheduleId: string, signal?: AbortSignal): Promise<ManagedCloudScheduleTask> {
    return withinManagedBoundary('Managed Cloud schedule refresh', () =>
      client.getSchedule(scheduleId, signal),
    );
  },

  createSchedule(
    input: ManagedCloudScheduleMutation,
    signal?: AbortSignal,
  ): Promise<ManagedCloudScheduleTask> {
    return withinManagedBoundary('Managed Cloud schedule creation', () =>
      client.createSchedule(input, signal),
    );
  },

  updateSchedule(
    scheduleId: string,
    input: ManagedCloudScheduleMutation,
    signal?: AbortSignal,
  ): Promise<ManagedCloudScheduleTask> {
    return withinManagedBoundary('Managed Cloud schedule update', () =>
      client.updateSchedule(scheduleId, input, signal),
    );
  },

  setScheduleEnabled(
    scheduleId: string,
    isActive: boolean,
    signal?: AbortSignal,
  ): Promise<ManagedCloudScheduleTask> {
    return withinManagedBoundary('Managed Cloud schedule status update', () =>
      client.setScheduleEnabled(scheduleId, isActive, signal),
    );
  },

  deleteSchedule(scheduleId: string, signal?: AbortSignal): Promise<void> {
    return withinManagedBoundary('Managed Cloud schedule deletion', () =>
      client.deleteSchedule(scheduleId, signal),
    );
  },

  listRuns(scheduleId: string, input: ManagedCloudSchedulesPageInput) {
    return withinManagedBoundary('Managed Cloud schedule run history', () =>
      client.listRuns(scheduleId, input),
    );
  },

  runNow(
    scheduleId: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<{ run: ManagedCloudScheduleRun; replay: boolean }> {
    return withinManagedBoundary('Managed Cloud schedule manual run', () =>
      client.runNow(scheduleId, idempotencyKey, signal),
    );
  },
};

export type DesktopCloudSchedulesApi = typeof desktopCloudSchedules;
