'use client';

import {
  DEVELOPER_COMMAND_NEEDS_UPDATE,
  DesktopRuntimeError,
  getHostBridge,
  type DeveloperCheckpointSectionsRequest,
  type DeveloperThreadRevertRequest,
} from '@agiworkforce/local-runtime-contract';
import type {
  CheckpointDiffResponse,
  CheckpointListResponse,
  CheckpointSectionsResponse,
  ThreadRevertResponse,
  WorktreeApplyResponse,
} from '@agiworkforce/types/protocol';
const NO_HOST_MESSAGE = 'Worktrees and checkpoints are only available in AGI Desktop.';

async function invoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const host = getHostBridge();
  if (!host) throw new Error(NO_HOST_MESSAGE);
  const response = await host.invokeRuntime<T>(command, args);
  if (response.ok) return response.value;
  if (response.error.code === 'unknown-command') {
    throw new DesktopRuntimeError({ ...response.error, message: DEVELOPER_COMMAND_NEEDS_UPDATE });
  }
  throw new DesktopRuntimeError(response.error);
}

export function listLocalCheckpoints(
  rootId: string,
  threadId: string,
): Promise<CheckpointListResponse> {
  return invoke<CheckpointListResponse>('developer_checkpoint_list', { rootId, threadId });
}

export function readLocalCheckpointDiff(
  rootId: string,
  threadId: string,
  turnId: string,
): Promise<CheckpointDiffResponse> {
  return invoke<CheckpointDiffResponse>('developer_checkpoint_diff', { rootId, threadId, turnId });
}

export function revertLocalSections(
  request: DeveloperCheckpointSectionsRequest,
): Promise<CheckpointSectionsResponse> {
  return invoke<CheckpointSectionsResponse>('developer_checkpoint_revert', { ...request });
}

export function stageLocalSections(
  request: DeveloperCheckpointSectionsRequest,
): Promise<CheckpointSectionsResponse> {
  return invoke<CheckpointSectionsResponse>('developer_checkpoint_stage', { ...request });
}

export function rewindLocalThread(
  request: DeveloperThreadRevertRequest,
): Promise<ThreadRevertResponse> {
  return invoke<ThreadRevertResponse>('developer_thread_revert', { ...request });
}

export function applyLocalWorktree(
  rootId: string,
  preview: boolean,
): Promise<WorktreeApplyResponse> {
  return invoke<WorktreeApplyResponse>('developer_worktree_apply', { rootId, preview });
}

export function deleteLocalWorktree(rootId: string): Promise<{ snapshotRef: string }> {
  return invoke<{ snapshotRef: string }>('developer_worktree_delete', { rootId });
}

export function pinLocalWorktree(rootId: string, pinned: boolean): Promise<boolean> {
  return invoke<boolean>('developer_worktree_pin', { rootId, pinned });
}

export function runLocalWorktreeSetup(rootId: string, sha256: string): Promise<boolean> {
  return invoke<boolean>('developer_worktree_setup_run', { rootId, sha256 });
}

/**
 * How many of the newest worktrees cleanup keeps; pass `keep` to change it. A
 * read answers null while no AGI CLI is running, since the shell will not start
 * one just to read a setting.
 */
export function localWorktreeKeep(
  rootId: string,
  keep?: number,
): Promise<{ keep: number; maxKeep: number } | null> {
  return invoke<{ keep: number; maxKeep: number } | null>('developer_worktree_keep', {
    rootId,
    ...(keep === undefined ? {} : { keep }),
  });
}
