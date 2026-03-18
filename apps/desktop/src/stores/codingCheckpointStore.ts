/**
 * Coding Checkpoint Store
 *
 * Wires the named file-snapshot checkpoint system to the frontend.
 * Commands (all in sys/commands/undo.rs):
 *
 *   coding_checkpoint_create  — snapshot files under a named label, returns checkpoint ID
 *   coding_checkpoint_list    — list all stored checkpoints (chronological order)
 *   coding_checkpoint_rewind  — restore files to a checkpoint, returns restored paths
 *
 * NOTE: A prior call used the wrong identifier "codingCheckpointRewind" (camelCase).
 * The correct command name is "coding_checkpoint_rewind" (snake_case as registered
 * in lib.rs). Tauri translates snake_case command names to camelCase for JS — but
 * the invoke() first argument must match the Rust fn name exactly.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';
import { toast } from 'sonner';

// =============================================================================
// Types (match Rust NamedFileCheckpoint in core/agent/change_tracker.rs)
// =============================================================================

/** A named file checkpoint returned by the backend. */
export interface NamedFileCheckpoint {
  /** UUID assigned by the backend. */
  id: string;
  /** Human-readable label provided at creation time. */
  name: string;
  /** ISO-8601 timestamp (UTC). */
  timestamp: string;
  /** Map from file path to snapshot content (may be large — not persisted). */
  fileSnapshots: Record<string, string>;
  /** Internal change index at the time of checkpoint creation. */
  changeIndex: number;
}

// =============================================================================
// Store State
// =============================================================================

interface CodingCheckpointState {
  checkpoints: NamedFileCheckpoint[];
  isLoading: boolean;
  isRewinding: boolean;
  lastRewindedPaths: string[];
  error: string | null;

  // Actions
  createCheckpoint: (name: string, paths: string[]) => Promise<string | null>;
  listCheckpoints: () => Promise<NamedFileCheckpoint[]>;
  rewindToCheckpoint: (id: string) => Promise<string[] | null>;
  clearError: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useCodingCheckpointStore = create<CodingCheckpointState>()(
  devtools(
    persist(
      immer((set, get) => ({
        checkpoints: [],
        isLoading: false,
        isRewinding: false,
        lastRewindedPaths: [],
        error: null,

        createCheckpoint: async (name, paths) => {
          if (!name.trim()) {
            toast.error('Checkpoint name cannot be empty');
            return null;
          }
          if (!paths.length) {
            toast.error('At least one file path is required');
            return null;
          }
          set(
            (state) => {
              state.isLoading = true;
              state.error = null;
            },
            undefined,
            'codingCheckpoint/create/start',
          );
          try {
            const id = await invoke<string>('coding_checkpoint_create', { name, paths });
            // Refresh the list so the new checkpoint shows immediately
            await get().listCheckpoints();
            set(
              (state) => {
                state.isLoading = false;
              },
              undefined,
              'codingCheckpoint/create/done',
            );
            toast.success(`Checkpoint "${name}" created`);
            return id;
          } catch (err) {
            const msg = String(err);
            set(
              (state) => {
                state.error = msg;
                state.isLoading = false;
              },
              undefined,
              'codingCheckpoint/create/error',
            );
            toast.error(`Failed to create checkpoint: ${msg}`);
            return null;
          }
        },

        listCheckpoints: async () => {
          set(
            (state) => {
              state.isLoading = true;
              state.error = null;
            },
            undefined,
            'codingCheckpoint/list/start',
          );
          try {
            const checkpoints = await invoke<NamedFileCheckpoint[]>('coding_checkpoint_list');
            set(
              (state) => {
                state.checkpoints = checkpoints;
                state.isLoading = false;
              },
              undefined,
              'codingCheckpoint/list/done',
            );
            return checkpoints;
          } catch (err) {
            const msg = String(err);
            set(
              (state) => {
                state.error = msg;
                state.isLoading = false;
              },
              undefined,
              'codingCheckpoint/list/error',
            );
            return [];
          }
        },

        rewindToCheckpoint: async (id) => {
          if (!id.trim()) {
            toast.error('Checkpoint ID is required');
            return null;
          }
          const checkpoint = get().checkpoints.find((c) => c.id === id);
          const label = checkpoint?.name ?? id;

          set(
            (state) => {
              state.isRewinding = true;
              state.error = null;
            },
            undefined,
            'codingCheckpoint/rewind/start',
          );
          try {
            const restoredPaths = await invoke<string[]>('coding_checkpoint_rewind', { id });
            set(
              (state) => {
                state.isRewinding = false;
                state.lastRewindedPaths = restoredPaths;
                // Prune checkpoints newer than rewound one
                const idx = state.checkpoints.findIndex((c) => c.id === id);
                if (idx !== -1) {
                  state.checkpoints = state.checkpoints.slice(0, idx + 1);
                }
              },
              undefined,
              'codingCheckpoint/rewind/done',
            );
            toast.success(`Rewound to "${label}" — restored ${restoredPaths.length} file(s)`);
            return restoredPaths;
          } catch (err) {
            const msg = String(err);
            set(
              (state) => {
                state.error = msg;
                state.isRewinding = false;
              },
              undefined,
              'codingCheckpoint/rewind/error',
            );
            toast.error(`Rewind failed: ${msg}`);
            return null;
          }
        },

        clearError: () =>
          set(
            (state) => {
              state.error = null;
            },
            undefined,
            'codingCheckpoint/clearError',
          ),
      })),
      {
        name: 'coding-checkpoint-store',
        version: 1,
        // Only persist the lightweight checkpoint metadata — not snapshot content
        partialize: (state) => ({
          checkpoints: state.checkpoints.map((c) => ({
            id: c.id,
            name: c.name,
            timestamp: c.timestamp,
            fileSnapshots: {},
            changeIndex: c.changeIndex,
          })),
        }),
      },
    ),
    { name: 'CodingCheckpointStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Selectors
// =============================================================================

export const selectCheckpoints = (state: CodingCheckpointState) => state.checkpoints;
export const selectCheckpointLoading = (state: CodingCheckpointState) => state.isLoading;
export const selectCheckpointRewinding = (state: CodingCheckpointState) => state.isRewinding;
export const selectLastRewindedPaths = (state: CodingCheckpointState) => state.lastRewindedPaths;
export const selectCheckpointError = (state: CodingCheckpointState) => state.error;
