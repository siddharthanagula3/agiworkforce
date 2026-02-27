import { api } from './api';
import type { Schedule, ScheduleRun, CreateScheduleInput } from '@/stores/scheduleStore';

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

/**
 * Fetch all schedules for the authenticated user.
 */
export async function fetchSchedules(): Promise<Schedule[]> {
  const data = await api.get<SchedulesListResponse>('/api/schedules');
  return data.schedules ?? [];
}

/**
 * Create a new scheduled task.
 */
export async function createSchedule(
  input: CreateScheduleInput,
): Promise<Schedule> {
  const data = await api.post<ScheduleResponse>('/api/schedules', input);
  return data.schedule;
}

/**
 * Update an existing schedule.
 */
export async function updateSchedule(
  id: string,
  input: Partial<Schedule>,
): Promise<Schedule> {
  const data = await api.put<ScheduleResponse>(`/api/schedules/${id}`, input);
  return data.schedule;
}

/**
 * Delete a schedule permanently.
 */
export async function deleteSchedule(id: string): Promise<void> {
  await api.delete(`/api/schedules/${id}`);
}

/**
 * Toggle a schedule's active status.
 */
export async function toggleSchedule(
  id: string,
  isActive: boolean,
): Promise<Schedule> {
  const data = await api.put<ScheduleResponse>(`/api/schedules/${id}`, {
    isActive,
  });
  return data.schedule;
}

/**
 * Fetch run history for a specific schedule.
 */
export async function fetchScheduleRuns(
  scheduleId: string,
): Promise<ScheduleRun[]> {
  const data = await api.get<RunsListResponse>(
    `/api/schedules/${scheduleId}/runs`,
  );
  return data.runs ?? [];
}

/**
 * Trigger an immediate run of a schedule.
 */
export async function triggerScheduleNow(
  id: string,
): Promise<ScheduleRun> {
  const data = await api.post<RunResponse>(`/api/schedules/${id}/runs`);
  return data.run;
}
