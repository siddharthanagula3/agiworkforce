/**
 * Checkpoint Store
 *
 * Wires all agi_checkpoint_* Tauri commands to the frontend for AGI task
 * checkpoint management. Checkpoints enable session persistence and resumption
 * of long-running AGI tasks.
 *
 * Covered commands (sys/commands/agi_checkpoint.rs):
 *   agi_checkpoint_init            — initialize the checkpoint system
 *   agi_checkpoint_save            — save a checkpoint for a task
 *   agi_checkpoint_get_latest      — get the latest checkpoint for a task
 *   agi_checkpoint_get             — get a specific checkpoint by ID
 *   agi_checkpoint_list            — list all checkpoints for a task
 *   agi_checkpoint_delete          — delete a specific checkpoint
 *   agi_checkpoint_restore_history — get checkpoint restore history for a task
 *   agi_checkpoint_record_restore  — record a successful checkpoint restore
 *   agi_checkpoint_cleanup         — clean up old checkpoints for a task
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { toast } from 'sonner';
import {
  saveCheckpoint,
  getLatestCheckpoint,
  getCheckpoint,
  listCheckpoints,
  deleteCheckpoint,
  getRestoreHistory,
  recordRestore,
  cleanupCheckpoints,
  initializeCheckpoints,
  type Checkpoint,
  type CheckpointListResponse,
  type SaveCheckpointRequest,
  type CheckpointId,
  type TaskId,
} from '../api/agi_checkpoint';

// =============================================================================
// Store State
// =============================================================================

interface CheckpointStoreState {
  /** All checkpoints currently loaded in memory, keyed by task ID */
  checkpointsByTask: Record<TaskId, CheckpointListResponse>;
  /** Fully loaded checkpoint objects, keyed by checkpoint ID */
  checkpointsById: Record<CheckpointId, Checkpoint>;
  /** The most recently fetched checkpoint per task */
  latestByTask: Record<TaskId, Checkpoint | null>;
  /** Whether any async operation is in progress */
  isLoading: boolean;
  /** Whether the checkpoint system has been initialized */
  isInitialized: boolean;
  /** Last error message, null when clear */
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  fetchCheckpoints: (taskId: TaskId, limit?: number) => Promise<CheckpointListResponse | null>;
  fetchLatestCheckpoint: (taskId: TaskId) => Promise<Checkpoint | null>;
  fetchCheckpointById: (checkpointId: CheckpointId) => Promise<Checkpoint | null>;
  saveCheckpoint: (request: SaveCheckpointRequest) => Promise<Checkpoint | null>;
  restoreCheckpoint: (
    checkpointId: CheckpointId,
    taskId: TaskId,
    resumedSteps: number,
    error?: string,
  ) => Promise<boolean>;
  deleteCheckpoint: (checkpointId: CheckpointId, taskId?: TaskId) => Promise<boolean>;
  fetchRestoreHistory: (taskId: TaskId) => Promise<string[]>;
  cleanupCheckpoints: (taskId: TaskId, keepCount?: number) => Promise<number>;
  clearError: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useCheckpointStore = create<CheckpointStoreState>()(
  devtools(
    immer((set, get) => ({
      checkpointsByTask: {},
      checkpointsById: {},
      latestByTask: {},
      isLoading: false,
      isInitialized: false,
      error: null,

      initialize: async () => {
        if (get().isInitialized) return;

        set(
          (state) => {
            state.isLoading = true;
            state.error = null;
          },
          undefined,
          'checkpoint/init/start',
        );
        try {
          await initializeCheckpoints();
          set(
            (state) => {
              state.isInitialized = true;
              state.isLoading = false;
            },
            undefined,
            'checkpoint/init/done',
          );
        } catch (err) {
          const msg = String(err);
          set(
            (state) => {
              state.error = msg;
              state.isLoading = false;
            },
            undefined,
            'checkpoint/init/error',
          );
          toast.error(`Failed to initialize checkpoint system: ${msg}`);
        }
      },

      fetchCheckpoints: async (taskId, limit) => {
        set(
          (state) => {
            state.isLoading = true;
            state.error = null;
          },
          undefined,
          'checkpoint/list/start',
        );
        try {
          const response = await listCheckpoints(taskId, limit);
          set(
            (state) => {
              state.checkpointsByTask[taskId] = response;
              state.isLoading = false;
            },
            undefined,
            'checkpoint/list/done',
          );
          return response;
        } catch (err) {
          const msg = String(err);
          set(
            (state) => {
              state.error = msg;
              state.isLoading = false;
            },
            undefined,
            'checkpoint/list/error',
          );
          return null;
        }
      },

      fetchLatestCheckpoint: async (taskId) => {
        try {
          const checkpoint = await getLatestCheckpoint(taskId);
          set(
            (state) => {
              state.latestByTask[taskId] = checkpoint;
              if (checkpoint) {
                state.checkpointsById[checkpoint.id] = checkpoint;
              }
            },
            undefined,
            'checkpoint/getLatest/done',
          );
          return checkpoint;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'checkpoint/getLatest/error',
          );
          return null;
        }
      },

      fetchCheckpointById: async (checkpointId) => {
        try {
          const checkpoint = await getCheckpoint(checkpointId);
          if (checkpoint) {
            set(
              (state) => {
                state.checkpointsById[checkpointId] = checkpoint;
              },
              undefined,
              'checkpoint/get/done',
            );
          }
          return checkpoint;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'checkpoint/get/error',
          );
          return null;
        }
      },

      saveCheckpoint: async (request) => {
        set(
          (state) => {
            state.isLoading = true;
            state.error = null;
          },
          undefined,
          'checkpoint/save/start',
        );
        try {
          const checkpoint = await saveCheckpoint(request);
          set(
            (state) => {
              state.checkpointsById[checkpoint.id] = checkpoint;
              // Update latest for this task
              state.latestByTask[request.task_id] = checkpoint;
              state.isLoading = false;
            },
            undefined,
            'checkpoint/save/done',
          );
          return checkpoint;
        } catch (err) {
          const msg = String(err);
          set(
            (state) => {
              state.error = msg;
              state.isLoading = false;
            },
            undefined,
            'checkpoint/save/error',
          );
          toast.error(`Failed to save checkpoint: ${msg}`);
          return null;
        }
      },

      restoreCheckpoint: async (checkpointId, taskId, resumedSteps, error) => {
        set(
          (state) => {
            state.isLoading = true;
            state.error = null;
          },
          undefined,
          'checkpoint/restore/start',
        );
        try {
          await recordRestore(checkpointId, taskId, resumedSteps, error);
          set(
            (state) => {
              state.isLoading = false;
            },
            undefined,
            'checkpoint/restore/done',
          );
          if (!error) {
            toast.success('Task resumed from checkpoint');
          } else {
            toast.error(`Checkpoint restore failed: ${error}`);
          }
          return true;
        } catch (err) {
          const msg = String(err);
          set(
            (state) => {
              state.error = msg;
              state.isLoading = false;
            },
            undefined,
            'checkpoint/restore/error',
          );
          toast.error(`Failed to record restore: ${msg}`);
          return false;
        }
      },

      deleteCheckpoint: async (checkpointId, taskId) => {
        try {
          await deleteCheckpoint(checkpointId);
          set(
            (state) => {
              delete state.checkpointsById[checkpointId];
              // Remove from task list if task ID provided
              if (taskId) {
                const taskEntry = state.checkpointsByTask[taskId];
                if (taskEntry) {
                  taskEntry.checkpoints = taskEntry.checkpoints.filter(
                    (c) => c.id !== checkpointId,
                  );
                }
                // Clear latest if it was this checkpoint
                if (state.latestByTask[taskId]?.id === checkpointId) {
                  state.latestByTask[taskId] = null;
                }
              }
            },
            undefined,
            'checkpoint/delete/done',
          );
          toast.info('Checkpoint deleted');
          return true;
        } catch (err) {
          const msg = String(err);
          set(
            (state) => {
              state.error = msg;
            },
            undefined,
            'checkpoint/delete/error',
          );
          toast.error(`Failed to delete checkpoint: ${msg}`);
          return false;
        }
      },

      fetchRestoreHistory: async (taskId) => {
        try {
          return await getRestoreHistory(taskId);
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'checkpoint/history/error',
          );
          return [];
        }
      },

      cleanupCheckpoints: async (taskId, keepCount) => {
        try {
          const deleted = await cleanupCheckpoints(taskId, keepCount);
          if (deleted > 0) {
            // Refresh the list for this task after cleanup
            const response = await listCheckpoints(taskId);
            set(
              (state) => {
                state.checkpointsByTask[taskId] = response;
              },
              undefined,
              'checkpoint/cleanup/done',
            );
            toast.info(`Cleaned up ${deleted} old checkpoint(s)`);
          }
          return deleted;
        } catch (err) {
          set(
            (state) => {
              state.error = String(err);
            },
            undefined,
            'checkpoint/cleanup/error',
          );
          return 0;
        }
      },

      clearError: () =>
        set(
          (state) => {
            state.error = null;
          },
          undefined,
          'checkpoint/clearError',
        ),
    })),
    { name: 'CheckpointStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Selectors
// =============================================================================

export const selectCheckpointsForTask = (taskId: TaskId) => (state: CheckpointStoreState) =>
  state.checkpointsByTask[taskId] ?? null;

export const selectLatestCheckpoint = (taskId: TaskId) => (state: CheckpointStoreState) =>
  state.latestByTask[taskId] ?? null;

export const selectCheckpointById = (checkpointId: CheckpointId) => (state: CheckpointStoreState) =>
  state.checkpointsById[checkpointId] ?? null;

export const selectCheckpointLoading = (state: CheckpointStoreState) => state.isLoading;
export const selectCheckpointError = (state: CheckpointStoreState) => state.error;
export const selectCheckpointInitialized = (state: CheckpointStoreState) => state.isInitialized;
