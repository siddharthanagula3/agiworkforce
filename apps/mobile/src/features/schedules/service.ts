import { api } from '@/services/api';
import { FEATURES } from '@/lib/v1FeatureFlags';
import type { Schedule, ScheduleRun, CreateScheduleInput } from './store';

/**
 * Schedule API Service
 *
 * All endpoints communicate with the Next.js API routes at /api/schedules.
 */

interface SchedulesListResponse {
  schedules: Schedule[];
}

interface ScheduleResponse {
  schedule: Schedule;
}

interface RunsListResponse {
  runs: ScheduleRun[];
}

interface RunResponse {
  run: ScheduleRun;
}

function assertSchedulesAvailable(): void {
  if (!FEATURES.schedules) throw new Error('schedules: cloud schedules not available in v1');
}

/**
 * Fetch all schedules for the authenticated user.
 */
export async function fetchSchedules(): Promise<Schedule[]> {
  assertSchedulesAvailable();
  const data = await api.get<SchedulesListResponse>('/api/schedules');
  return data.schedules ?? [];
}

/**
 * Create a new scheduled task.
 */
export async function createSchedule(input: CreateScheduleInput): Promise<Schedule> {
  assertSchedulesAvailable();
  const data = await api.post<ScheduleResponse>('/api/schedules', input);
  return data.schedule;
}

/**
 * Update an existing schedule.
 */
export async function updateSchedule(id: string, input: Partial<Schedule>): Promise<Schedule> {
  assertSchedulesAvailable();
  const data = await api.put<ScheduleResponse>(`/api/schedules/${id}`, input);
  return data.schedule;
}

/**
 * Delete a schedule permanently.
 */
export async function deleteSchedule(id: string): Promise<void> {
  assertSchedulesAvailable();
  await api.delete(`/api/schedules/${id}`);
}

/**
 * Toggle a schedule's active status.
 */
export async function toggleSchedule(id: string, isActive: boolean): Promise<Schedule> {
  assertSchedulesAvailable();
  const data = await api.put<ScheduleResponse>(`/api/schedules/${id}`, {
    isActive,
  });
  return data.schedule;
}

/**
 * Fetch run history for a specific schedule.
 */
export async function fetchScheduleRuns(scheduleId: string): Promise<ScheduleRun[]> {
  assertSchedulesAvailable();
  const data = await api.get<RunsListResponse>(`/api/schedules/${scheduleId}/runs`);
  return data.runs ?? [];
}

/**
 * Trigger an immediate run of a schedule.
 */
export async function triggerScheduleNow(id: string): Promise<ScheduleRun> {
  assertSchedulesAvailable();
  const data = await api.post<RunResponse>(`/api/schedules/${id}/runs`);
  return data.run;
}
