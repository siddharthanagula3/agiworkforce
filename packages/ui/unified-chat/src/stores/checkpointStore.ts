
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface Checkpoint {
  id: string;
  messageId: string;
  createdAt: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface Branch {
  id: string;
  rootMessageId: string;
  childMessageIds: string[];
  activeMessageId: string;
  name?: string;
}

interface CheckpointState {
  checkpointsByConversation: Record<string, Checkpoint[]>;
  branchesByConversation: Record<string, Branch[]>;
  activeBranchByConversation: Record<string, string>;

  setCheckpoints: (conversationId: string, checkpoints: Checkpoint[]) => void;
  addCheckpoint: (conversationId: string, checkpoint: Checkpoint) => void;
  removeCheckpoint: (conversationId: string, checkpointId: string) => void;

  setBranches: (conversationId: string, branches: Branch[]) => void;
  setActiveBranch: (conversationId: string, branchId: string) => void;
  forkAtCheckpoint: (conversationId: string, checkpoint: Checkpoint, newBranchId: string) => void;
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
