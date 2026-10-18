import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';
import { toast } from 'sonner';

export interface NamedFileCheckpoint {
  id: string;
  name: string;
  timestamp: string;
  fileSnapshots: Record<string, string>;
  changeIndex: number;
}

interface CodingCheckpointState {
  checkpoints: NamedFileCheckpoint[];
  isLoading: boolean;
  isRewinding: boolean;
  lastRewindedPaths: string[];
  error: string | null;

  listCheckpoints: () => Promise<NamedFileCheckpoint[]>;
  rewindToCheckpoint: (id: string) => Promise<string[] | null>;
  clearError: () => void;
}

export const useCodingCheckpointStore = create<CodingCheckpointState>()(
  devtools(
    persist(
      immer((set, get) => ({
        checkpoints: [],
        isLoading: false,
        isRewinding: false,
        lastRewindedPaths: [],
        error: null,

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
            forgetCheckpointAvailability();
            set(
              (state) => {
                state.isRewinding = false;
                state.lastRewindedPaths = restoredPaths;
                const idx = state.checkpoints.findIndex((c) => c.id === id);
                if (idx !== -1) {
                  state.checkpoints = state.checkpoints.slice(0, idx + 1);
                }
              },
              undefined,
              'codingCheckpoint/rewind/done',
            );
            toast.success(`Rewound to "${label}", restored ${restoredPaths.length} file(s)`);
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

export type CheckpointAvailability = 'available' | 'ended' | 'unknown';

const liveCheckpointIds = new Set<string>();
const endedCheckpointIds = new Set<string>();
let liveCheckpointRefresh: Promise<void> | null = null;

async function refreshLiveCheckpointIds(): Promise<void> {
  const checkpoints = await invoke<NamedFileCheckpoint[]>('coding_checkpoint_list');
  liveCheckpointIds.clear();
  for (const checkpoint of checkpoints) {
    liveCheckpointIds.add(checkpoint.id);
  }
}

export async function resolveCheckpointAvailability(id: string): Promise<CheckpointAvailability> {
  if (liveCheckpointIds.has(id)) return 'available';
  if (endedCheckpointIds.has(id)) return 'ended';

  try {
    if (liveCheckpointRefresh) {
      await liveCheckpointRefresh;
      if (liveCheckpointIds.has(id)) return 'available';
    }
    liveCheckpointRefresh ??= refreshLiveCheckpointIds().finally(() => {
      liveCheckpointRefresh = null;
    });
    await liveCheckpointRefresh;
  } catch {
    return 'unknown';
  }

  if (liveCheckpointIds.has(id)) return 'available';
  endedCheckpointIds.add(id);
  return 'ended';
}

export function forgetCheckpointAvailability(): void {
  liveCheckpointIds.clear();
  endedCheckpointIds.clear();
  liveCheckpointRefresh = null;
}

export function useCheckpointAvailability(
  checkpointId: string | undefined,
): CheckpointAvailability | null {
  const [resolved, setResolved] = useState<{
    id: string;
    availability: CheckpointAvailability;
  } | null>(null);

  useEffect(() => {
    if (!checkpointId) return;
    let cancelled = false;
    void resolveCheckpointAvailability(checkpointId).then((availability) => {
      if (!cancelled) setResolved({ id: checkpointId, availability });
    });
    return () => {
      cancelled = true;
    };
  }, [checkpointId]);

  return resolved && resolved.id === checkpointId ? resolved.availability : null;
}

export const selectCheckpoints = (state: CodingCheckpointState) => state.checkpoints;
export const selectCheckpointLoading = (state: CodingCheckpointState) => state.isLoading;
export const selectCheckpointRewinding = (state: CodingCheckpointState) => state.isRewinding;
export const selectLastRewindedPaths = (state: CodingCheckpointState) => state.lastRewindedPaths;
export const selectCheckpointError = (state: CodingCheckpointState) => state.error;
