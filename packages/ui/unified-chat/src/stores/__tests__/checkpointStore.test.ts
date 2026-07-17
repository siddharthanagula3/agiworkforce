/**
 * Phase A Slice 3 — checkpointStore tests.
 *
 * Tests: Checkpoint CRUD, Branch CRUD, forkAtCheckpoint, clearConversation,
 * and all selectors.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  useCheckpointStore,
  selectCheckpoints,
  selectBranches,
  selectActiveBranchId,
} from '../checkpointStore';
import type { Checkpoint, Branch } from '../checkpointStore';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function resetStore() {
  useCheckpointStore.setState({
    checkpointsByConversation: {},
    branchesByConversation: {},
    activeBranchByConversation: {},
  });
}

function makeCheckpoint(overrides?: Partial<Checkpoint>): Checkpoint {
  return {
    id: `cp-${Math.random()}`,
    messageId: `msg-${Math.random()}`,
    createdAt: new Date().toISOString(),
    label: 'Test checkpoint',
    ...overrides,
  };
}

function makeBranch(overrides?: Partial<Branch>): Branch {
  return {
    id: `branch-${Math.random()}`,
    rootMessageId: `msg-root-${Math.random()}`,
    childMessageIds: [],
    activeMessageId: `msg-root-${Math.random()}`,
    ...overrides,
  };
}

const CONV_A = 'conv-a';
const CONV_B = 'conv-b';

// ─────────────────────────────────────────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────────────────────────────────────────

describe('checkpointStore — initial state', () => {
  beforeEach(resetStore);

  it('selectCheckpoints returns [] for unknown conversation', () => {
    expect(selectCheckpoints(CONV_A)(useCheckpointStore.getState())).toEqual([]);
  });

  it('selectBranches returns [] for unknown conversation', () => {
    expect(selectBranches(CONV_A)(useCheckpointStore.getState())).toEqual([]);
  });

  it('selectActiveBranchId returns undefined for unknown conversation', () => {
    expect(selectActiveBranchId(CONV_A)(useCheckpointStore.getState())).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setCheckpoints
// ─────────────────────────────────────────────────────────────────────────────

describe('checkpointStore — setCheckpoints', () => {
  beforeEach(resetStore);

  it('stores and retrieves checkpoints for a conversation', () => {
    const cp1 = makeCheckpoint({ id: 'cp-1', label: 'Before refactor' });
    const cp2 = makeCheckpoint({ id: 'cp-2', label: 'After cleanup' });
    useCheckpointStore.getState().setCheckpoints(CONV_A, [cp1, cp2]);
    const result = selectCheckpoints(CONV_A)(useCheckpointStore.getState());
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('cp-1');
    expect(result[1]!.label).toBe('After cleanup');
  });

  it('replaces existing checkpoint list for a conversation', () => {
    useCheckpointStore.getState().setCheckpoints(CONV_A, [makeCheckpoint({ id: 'old' })]);
    useCheckpointStore
      .getState()
      .setCheckpoints(CONV_A, [makeCheckpoint({ id: 'new-1' }), makeCheckpoint({ id: 'new-2' })]);
    expect(selectCheckpoints(CONV_A)(useCheckpointStore.getState())).toHaveLength(2);
  });

  it('conversations are isolated', () => {
    useCheckpointStore.getState().setCheckpoints(CONV_A, [makeCheckpoint()]);
    useCheckpointStore.getState().setCheckpoints(CONV_B, [makeCheckpoint(), makeCheckpoint()]);
    expect(selectCheckpoints(CONV_A)(useCheckpointStore.getState())).toHaveLength(1);
    expect(selectCheckpoints(CONV_B)(useCheckpointStore.getState())).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addCheckpoint
// ─────────────────────────────────────────────────────────────────────────────

describe('checkpointStore — addCheckpoint', () => {
  beforeEach(resetStore);

  it('creates bucket and prepends checkpoint if list is absent', () => {
    const cp = makeCheckpoint({ id: 'first' });
    useCheckpointStore.getState().addCheckpoint(CONV_A, cp);
    const result = selectCheckpoints(CONV_A)(useCheckpointStore.getState());
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('first');
  });

  it('prepends so newest appears first', () => {
    useCheckpointStore.getState().addCheckpoint(CONV_A, makeCheckpoint({ id: 'older' }));
    useCheckpointStore.getState().addCheckpoint(CONV_A, makeCheckpoint({ id: 'newest' }));
    const result = selectCheckpoints(CONV_A)(useCheckpointStore.getState());
    expect(result[0]!.id).toBe('newest');
    expect(result[1]!.id).toBe('older');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// removeCheckpoint
// ─────────────────────────────────────────────────────────────────────────────

describe('checkpointStore — removeCheckpoint', () => {
  beforeEach(resetStore);

  it('removes a checkpoint by id', () => {
    const cp1 = makeCheckpoint({ id: 'keep' });
    const cp2 = makeCheckpoint({ id: 'remove-me' });
    useCheckpointStore.getState().setCheckpoints(CONV_A, [cp1, cp2]);
    useCheckpointStore.getState().removeCheckpoint(CONV_A, 'remove-me');
    const result = selectCheckpoints(CONV_A)(useCheckpointStore.getState());
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('keep');
  });

  it('is no-op for unknown conversation', () => {
    // Should not throw
    useCheckpointStore.getState().removeCheckpoint('no-such-conv', 'any-id');
    expect(selectCheckpoints('no-such-conv')(useCheckpointStore.getState())).toEqual([]);
  });

  it('is no-op for unknown checkpointId', () => {
    const cp = makeCheckpoint({ id: 'existing' });
    useCheckpointStore.getState().setCheckpoints(CONV_A, [cp]);
    useCheckpointStore.getState().removeCheckpoint(CONV_A, 'ghost-id');
    expect(selectCheckpoints(CONV_A)(useCheckpointStore.getState())).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setBranches / setActiveBranch
// ─────────────────────────────────────────────────────────────────────────────

describe('checkpointStore — branches', () => {
  beforeEach(resetStore);

  it('setBranches stores branch list for a conversation', () => {
    const b1 = makeBranch({ id: 'main', name: 'main' });
    const b2 = makeBranch({ id: 'alt', name: 'alt-approach' });
    useCheckpointStore.getState().setBranches(CONV_A, [b1, b2]);
    const result = selectBranches(CONV_A)(useCheckpointStore.getState());
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('main');
  });

  it('setActiveBranch updates the active branch id', () => {
    useCheckpointStore.getState().setActiveBranch(CONV_A, 'branch-xyz');
    expect(selectActiveBranchId(CONV_A)(useCheckpointStore.getState())).toBe('branch-xyz');
  });

  it('branch conversations are isolated', () => {
    useCheckpointStore.getState().setBranches(CONV_A, [makeBranch()]);
    useCheckpointStore.getState().setBranches(CONV_B, [makeBranch(), makeBranch()]);
    expect(selectBranches(CONV_A)(useCheckpointStore.getState())).toHaveLength(1);
    expect(selectBranches(CONV_B)(useCheckpointStore.getState())).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// forkAtCheckpoint
// ─────────────────────────────────────────────────────────────────────────────

describe('checkpointStore — forkAtCheckpoint', () => {
  beforeEach(resetStore);

  it('creates a new branch and sets it as active', () => {
    const cp = makeCheckpoint({ id: 'cp-fork', messageId: 'msg-42', label: 'Fork point' });
    useCheckpointStore.getState().forkAtCheckpoint(CONV_A, cp, 'new-branch-id');

    const branches = selectBranches(CONV_A)(useCheckpointStore.getState());
    expect(branches).toHaveLength(1);
    expect(branches[0]!.id).toBe('new-branch-id');
    expect(branches[0]!.rootMessageId).toBe('msg-42');
    expect(branches[0]!.activeMessageId).toBe('msg-42');
    expect(branches[0]!.name).toBe('Fork: Fork point');

    expect(selectActiveBranchId(CONV_A)(useCheckpointStore.getState())).toBe('new-branch-id');
  });

  it('appends to existing branches list', () => {
    const existing = makeBranch({ id: 'main' });
    useCheckpointStore.getState().setBranches(CONV_A, [existing]);

    const cp = makeCheckpoint({ id: 'cp-2', messageId: 'msg-99' });
    useCheckpointStore.getState().forkAtCheckpoint(CONV_A, cp, 'forked-branch');

    const branches = selectBranches(CONV_A)(useCheckpointStore.getState());
    expect(branches).toHaveLength(2);
    expect(branches[1]!.id).toBe('forked-branch');
  });

  it('fork branch name is undefined when checkpoint has no label', () => {
    const cp = makeCheckpoint({ id: 'cp-nolabel', messageId: 'msg-1', label: undefined });
    useCheckpointStore.getState().forkAtCheckpoint(CONV_A, cp, 'branch-no-label');
    const branches = selectBranches(CONV_A)(useCheckpointStore.getState());
    expect(branches[0]!.name).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// clearConversation
// ─────────────────────────────────────────────────────────────────────────────

describe('checkpointStore — clearConversation', () => {
  beforeEach(resetStore);

  it('removes all state for a conversation', () => {
    useCheckpointStore.getState().setCheckpoints(CONV_A, [makeCheckpoint()]);
    useCheckpointStore.getState().setBranches(CONV_A, [makeBranch()]);
    useCheckpointStore.getState().setActiveBranch(CONV_A, 'some-branch');

    useCheckpointStore.getState().clearConversation(CONV_A);

    expect(selectCheckpoints(CONV_A)(useCheckpointStore.getState())).toEqual([]);
    expect(selectBranches(CONV_A)(useCheckpointStore.getState())).toEqual([]);
    expect(selectActiveBranchId(CONV_A)(useCheckpointStore.getState())).toBeUndefined();
  });

  it('does not affect other conversations', () => {
    useCheckpointStore.getState().setCheckpoints(CONV_A, [makeCheckpoint()]);
    useCheckpointStore.getState().setCheckpoints(CONV_B, [makeCheckpoint(), makeCheckpoint()]);

    useCheckpointStore.getState().clearConversation(CONV_A);

    expect(selectCheckpoints(CONV_A)(useCheckpointStore.getState())).toEqual([]);
    expect(selectCheckpoints(CONV_B)(useCheckpointStore.getState())).toHaveLength(2);
  });
});
