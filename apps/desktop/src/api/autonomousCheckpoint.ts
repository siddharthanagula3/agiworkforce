/**
 * Autonomous Task Checkpoint API
 *
 * TypeScript wrappers for the autonomous task checkpoint persistence commands.
 * These complement the AGI checkpoint system by handling background/autonomous
 * task checkpoints specifically.
 *
 * Covered commands (sys/commands/agi_checkpoint.rs):
 *   list_autonomous_task_checkpoints          — list all autonomous checkpoints
 *   list_autonomous_task_checkpoints_by_task  — list checkpoints for a task
 *   resume_autonomous_task                    — resume from latest checkpoint
 *   delete_autonomous_task_checkpoint         — delete a specific checkpoint
 *   delete_autonomous_task_checkpoints        — delete all checkpoints for a task
 */

import { invoke, isTauri } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

/** An autonomous task checkpoint persisted to disk. */
export interface AutonomousTaskCheckpoint {
  id: string;
  taskId: string;
  goalDescription: string;
  completedStepIndex: number;
  totalSteps: number;
  status: string;
  createdAt: string;
  stateSnapshot?: string;
  error?: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * List all autonomous task checkpoints (newest first, max 100).
 */
export async function listAutonomousCheckpoints(): Promise<AutonomousTaskCheckpoint[]> {
  if (!isTauri) {
    console.debug('[autonomousCheckpoint] listAutonomousCheckpoints (mock)');
    return [];
  }

  return invoke<AutonomousTaskCheckpoint[]>('list_autonomous_task_checkpoints');
}

/**
 * List autonomous checkpoints for a specific task.
 */
export async function listAutonomousCheckpointsByTask(
  taskId: string,
): Promise<AutonomousTaskCheckpoint[]> {
  if (!isTauri) {
    console.debug('[autonomousCheckpoint] listAutonomousCheckpointsByTask (mock)', taskId);
    return [];
  }

  return invoke<AutonomousTaskCheckpoint[]>('list_autonomous_task_checkpoints_by_task', { taskId });
}

/**
 * Resume an autonomous task from its latest checkpoint.
 * Returns the serialized checkpoint data that can be fed to the
 * autonomous agent's resume mechanism.
 */
export async function resumeAutonomousTask(taskId: string): Promise<string> {
  if (!isTauri) {
    console.debug('[autonomousCheckpoint] resumeAutonomousTask (mock)', taskId);
    return '{}';
  }

  return invoke<string>('resume_autonomous_task', { taskId });
}

/**
 * Delete a specific autonomous task checkpoint by ID.
 */
export async function deleteAutonomousCheckpoint(checkpointId: string): Promise<void> {
  if (!isTauri) {
    console.debug('[autonomousCheckpoint] deleteAutonomousCheckpoint (mock)', checkpointId);
    return;
  }

  return invoke<void>('delete_autonomous_task_checkpoint', { checkpointId });
}

/**
 * Delete all autonomous checkpoints for a task.
 * Returns the number of checkpoints deleted.
 */
export async function deleteAutonomousCheckpointsForTask(taskId: string): Promise<number> {
  if (!isTauri) {
    console.debug('[autonomousCheckpoint] deleteAutonomousCheckpointsForTask (mock)', taskId);
    return 0;
  }

  return invoke<number>('delete_autonomous_task_checkpoints', { taskId });
}
