import {
  createManagedCloudSchedulesClient,
  type ManagedCloudScheduleMutation,
  type ManagedCloudScheduleRun,
  type ManagedCloudScheduleTask,
  type ManagedCloudSchedulesClient,
  type ManagedCloudSchedulesPageInput,
} from '@agiworkforce/cloud-contracts';
import { CLOUD_API_BASE_URL } from '../api/cloudApi';
import { createManagedCloudRequestContext } from './managedCloudRequestContext';

async function withSchedulesClient<T>(
  label: string,
  operation: (client: ManagedCloudSchedulesClient) => Promise<T>,
): Promise<T> {
  const request = createManagedCloudRequestContext(label);
  const client = createManagedCloudSchedulesClient({
    baseUrl: CLOUD_API_BASE_URL,
    credentials: 'include',
    getHeaders: () => request.getHeaders(),
    fetchImpl: request.fetch,
  });
  const result = await operation(client);
  request.assertBoundary();
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
    return withSchedulesClient('Managed Cloud schedule list', (client) =>
      client.listSchedules(input),
    );
  },

  getSchedule(scheduleId: string, signal?: AbortSignal): Promise<ManagedCloudScheduleTask> {
    return withSchedulesClient('Managed Cloud schedule refresh', (client) =>
      client.getSchedule(scheduleId, signal),
    );
  },

  createSchedule(
    input: ManagedCloudScheduleMutation,
    signal?: AbortSignal,
  ): Promise<ManagedCloudScheduleTask> {
    return withSchedulesClient('Managed Cloud schedule creation', (client) =>
      client.createSchedule(input, signal),
    );
  },

  updateSchedule(
    scheduleId: string,
    input: ManagedCloudScheduleMutation,
    signal?: AbortSignal,
  ): Promise<ManagedCloudScheduleTask> {
    return withSchedulesClient('Managed Cloud schedule update', (client) =>
      client.updateSchedule(scheduleId, input, signal),
    );
  },

  setScheduleEnabled(
    scheduleId: string,
    isActive: boolean,
    signal?: AbortSignal,
  ): Promise<ManagedCloudScheduleTask> {
    return withSchedulesClient('Managed Cloud schedule status update', (client) =>
      client.setScheduleEnabled(scheduleId, isActive, signal),
    );
  },

  deleteSchedule(scheduleId: string, signal?: AbortSignal): Promise<void> {
    return withSchedulesClient('Managed Cloud schedule deletion', (client) =>
      client.deleteSchedule(scheduleId, signal),
    );
  },

  listRuns(scheduleId: string, input: ManagedCloudSchedulesPageInput) {
    return withSchedulesClient('Managed Cloud schedule run history', (client) =>
      client.listRuns(scheduleId, input),
    );
  },

  runNow(
    scheduleId: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<{ run: ManagedCloudScheduleRun; replay: boolean }> {
    return withSchedulesClient('Managed Cloud schedule manual run', (client) =>
      client.runNow(scheduleId, idempotencyKey, signal),
    );
  },
};

export type DesktopCloudSchedulesApi = typeof desktopCloudSchedules;
