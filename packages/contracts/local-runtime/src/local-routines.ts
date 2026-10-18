import type { ScheduleConfig, ScheduleNotificationSettings } from '@agiworkforce/types';

export interface LocalRoutineInput {
  name: string;
  rootId: string;
  model: string;
  prompt: string;
  schedule: ScheduleConfig;
  missedExecutionPolicy: 'run_once' | 'skip';
  keepAwake: boolean;
  notificationSettings: ScheduleNotificationSettings;
}

export type LocalRoutineRunState =
  | 'starting'
  | 'running'
  | 'awaiting_input'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'skipped';

export interface LocalRoutineRun {
  id: string;
  dueAt: string;
  startedAt: string;
  finishedAt?: string;
  state: LocalRoutineRunState;
  threadId?: string;
  turnId?: string;
  error?: string;
}

export interface LocalRoutine extends LocalRoutineInput {
  id: string;
  deviceId: string;
  creationDigest: string;
  rootIdentity: string;
  grantRevision: string;
  nextExecutionAt: string | null;
  executionCount: number;
  pausedReason: string | null;
  runs: LocalRoutineRun[];
  createdAt: string;
  updatedAt: string;
}

export interface LocalRoutineState {
  deviceId: string;
  suspended: boolean;
  error: string | null;
  routines: LocalRoutine[];
}

export const LOCAL_ROUTINE_COMMANDS = [
  'local_routine_list',
  'local_routine_create',
  'local_routine_set_enabled',
  'local_routine_remove',
] as const;
