/**
 * checkpointStore — surface-agnostic state for conversation checkpoints + branches.
 *
 * Phase A Slice 3: ported from apps/desktop/src/components/UnifiedAgenticChat/.
 *
 * No Tauri, no Supabase, no auth token. Hosts push data via actions; the store
 * is keyed by conversationId so multiple conversations can coexist in the same
 * package session.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A named snapshot of the conversation at a particular message.
 * Field names are camelCase (surface-agnostic); hosts map from their
 * wire format (e.g. snake_case DB rows) before calling setCheckpoints.
 */
export interface Checkpoint {
  id: string;
  messageId: string;
  createdAt: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

/**
 * A conversation branch — one version of the dialogue tree rooted at a
 * particular message fork point.
 */
export interface Branch {
  id: string;
  rootMessageId: string;
  childMessageIds: string[];
  activeMessageId: string;
  /** Optional human-readable name (e.g. "main", "try-python-approach"). */
  name?: string;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface CheckpointState {
  /** Conversation-keyed list of checkpoints (ordered newest-first). */
  checkpointsByConversation: Record<string, Checkpoint[]>;
  /** Conversation-keyed list of branches. */
  branchesByConversation: Record<string, Branch[]>;
  /** Per-conversation active branch id. */
  activeBranchByConversation: Record<string, string>;

  /** Replace the full checkpoint list for a conversation. */
  setCheckpoints: (conversationId: string, checkpoints: Checkpoint[]) => void;
  /** Prepend a single checkpoint for a conversation. */
  addCheckpoint: (conversationId: string, checkpoint: Checkpoint) => void;
  /** Remove a checkpoint by id for a conversation. */
  removeCheckpoint: (conversationId: string, checkpointId: string) => void;

  /** Replace the full branch list for a conversation. */
  setBranches: (conversationId: string, branches: Branch[]) => void;
  /** Set the active branch id for a conversation. */
  setActiveBranch: (conversationId: string, branchId: string) => void;
  /**
   * Fork at a checkpoint: creates a new branch rooted at the checkpoint's
   * messageId and sets it as active. Returns the new branch id.
   * The host is responsible for persisting the fork via its own transport.
   */
  forkAtCheckpoint: (conversationId: string, checkpoint: Checkpoint, newBranchId: string) => void;
  /** Clear all checkpoint + branch state for a conversation. */
  clearConversation: (conversationId: string) => void;
}

export const useCheckpointStore = create<CheckpointState>()(
  immer((set) => ({
    checkpointsByConversation: {},
    branchesByConversation: {},
    activeBranchByConversation: {},

    setCheckpoints: (conversationId, checkpoints) =>
      set((state) => {
        state.checkpointsByConversation[conversationId] = checkpoints;
      }),

    addCheckpoint: (conversationId, checkpoint) =>
      set((state) => {
        if (!state.checkpointsByConversation[conversationId]) {
          state.checkpointsByConversation[conversationId] = [];
        }
        // Prepend so newest appears first.
        state.checkpointsByConversation[conversationId]!.unshift(checkpoint);
      }),

    removeCheckpoint: (conversationId, checkpointId) =>
      set((state) => {
        const existing = state.checkpointsByConversation[conversationId];
        if (!existing) return;
        state.checkpointsByConversation[conversationId] = existing.filter(
          (c) => c.id !== checkpointId,
        );
      }),

    setBranches: (conversationId, branches) =>
      set((state) => {
        state.branchesByConversation[conversationId] = branches;
      }),

    setActiveBranch: (conversationId, branchId) =>
      set((state) => {
        state.activeBranchByConversation[conversationId] = branchId;
      }),

    forkAtCheckpoint: (conversationId, checkpoint, newBranchId) =>
      set((state) => {
        const newBranch: Branch = {
          id: newBranchId,
          rootMessageId: checkpoint.messageId,
          childMessageIds: [],
          activeMessageId: checkpoint.messageId,
          name: checkpoint.label ? `Fork: ${checkpoint.label}` : undefined,
        };
        if (!state.branchesByConversation[conversationId]) {
          state.branchesByConversation[conversationId] = [];
        }
        state.branchesByConversation[conversationId]!.push(newBranch);
        state.activeBranchByConversation[conversationId] = newBranchId;
      }),

    clearConversation: (conversationId) =>
      set((state) => {
        delete state.checkpointsByConversation[conversationId];
        delete state.branchesByConversation[conversationId];
        delete state.activeBranchByConversation[conversationId];
      }),
  })),
);

// ── Selectors ─────────────────────────────────────────────────────────────────

export const selectCheckpoints =
  (conversationId: string) =>
  (state: CheckpointState): Checkpoint[] =>
    state.checkpointsByConversation[conversationId] ?? [];

export const selectBranches =
  (conversationId: string) =>
  (state: CheckpointState): Branch[] =>
    state.branchesByConversation[conversationId] ?? [];

export const selectActiveBranchId =
  (conversationId: string) =>
  (state: CheckpointState): string | undefined =>
    state.activeBranchByConversation[conversationId];
