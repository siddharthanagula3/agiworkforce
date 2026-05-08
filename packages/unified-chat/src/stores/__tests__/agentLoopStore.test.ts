import { beforeEach, describe, expect, it } from 'vitest';

import {
  useAgentLoopStore,
  selectAgentLoop,
  selectActiveGoal,
  selectActionLog,
} from '../agentLoopStore';
import type { AgentLoopStatus, ActiveGoal, ActionLogEntry } from '../agentLoopStore';

function resetStore() {
  useAgentLoopStore.setState({
    agentLoop: null,
    activeGoal: null,
    actionLogByMessage: {},
  });
}

const SAMPLE_LOOP: AgentLoopStatus = {
  active: true,
  iteration: 2,
  maxIterations: 10,
  phase: 'executing',
};

const SAMPLE_GOAL: ActiveGoal = {
  id: 'goal-1',
  description: 'Refactor auth module',
  status: 'executing',
  startTime: Date.now() - 5000,
  totalSteps: 8,
  completedSteps: 3,
  progressPercent: 37,
};

function makeEntry(overrides?: Partial<ActionLogEntry>): ActionLogEntry {
  return {
    id: `entry-${Math.random()}`,
    type: 'terminal',
    title: 'Run tests',
    status: 'running',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('agentLoopStore — setAgentLoop / selectAgentLoop', () => {
  beforeEach(resetStore);

  it('starts null', () => {
    expect(selectAgentLoop(useAgentLoopStore.getState())).toBeNull();
  });

  it('sets active loop status', () => {
    useAgentLoopStore.getState().setAgentLoop(SAMPLE_LOOP);
    const loop = selectAgentLoop(useAgentLoopStore.getState());
    expect(loop?.active).toBe(true);
    expect(loop?.iteration).toBe(2);
    expect(loop?.maxIterations).toBe(10);
    expect(loop?.phase).toBe('executing');
  });

  it('clears loop by passing null', () => {
    useAgentLoopStore.getState().setAgentLoop(SAMPLE_LOOP);
    useAgentLoopStore.getState().setAgentLoop(null);
    expect(selectAgentLoop(useAgentLoopStore.getState())).toBeNull();
  });
});

describe('agentLoopStore — setActiveGoal / selectActiveGoal', () => {
  beforeEach(resetStore);

  it('starts null', () => {
    expect(selectActiveGoal(useAgentLoopStore.getState())).toBeNull();
  });

  it('sets and reads active goal', () => {
    useAgentLoopStore.getState().setActiveGoal(SAMPLE_GOAL);
    const goal = selectActiveGoal(useAgentLoopStore.getState());
    expect(goal?.id).toBe('goal-1');
    expect(goal?.description).toBe('Refactor auth module');
    expect(goal?.totalSteps).toBe(8);
    expect(goal?.completedSteps).toBe(3);
    expect(goal?.progressPercent).toBe(37);
  });

  it('clears goal by passing null', () => {
    useAgentLoopStore.getState().setActiveGoal(SAMPLE_GOAL);
    useAgentLoopStore.getState().setActiveGoal(null);
    expect(selectActiveGoal(useAgentLoopStore.getState())).toBeNull();
  });
});

describe('agentLoopStore — action log', () => {
  beforeEach(resetStore);

  it('returns empty array for unknown messageId', () => {
    const entries = selectActionLog('msg-unknown')(useAgentLoopStore.getState());
    expect(entries).toEqual([]);
  });

  it('setActionLog replaces entries for a message', () => {
    const e1 = makeEntry({ id: 'e1', title: 'A' });
    const e2 = makeEntry({ id: 'e2', title: 'B' });
    useAgentLoopStore.getState().setActionLog('msg-1', [e1, e2]);
    const entries = selectActionLog('msg-1')(useAgentLoopStore.getState());
    expect(entries).toHaveLength(2);
    expect(entries[0]!.id).toBe('e1');
  });

  it('pushActionLogEntry appends to message', () => {
    const e1 = makeEntry({ id: 'e1' });
    const e2 = makeEntry({ id: 'e2' });
    useAgentLoopStore.getState().pushActionLogEntry('msg-2', e1);
    useAgentLoopStore.getState().pushActionLogEntry('msg-2', e2);
    const entries = selectActionLog('msg-2')(useAgentLoopStore.getState());
    expect(entries).toHaveLength(2);
  });

  it('pushActionLogEntry creates message bucket if absent', () => {
    const e = makeEntry({ id: 'e-new' });
    useAgentLoopStore.getState().pushActionLogEntry('msg-new', e);
    expect(selectActionLog('msg-new')(useAgentLoopStore.getState())).toHaveLength(1);
  });

  it('updateActionLogEntry patches an existing entry', () => {
    const e = makeEntry({ id: 'e-upd', status: 'running', title: 'Before' });
    useAgentLoopStore.getState().setActionLog('msg-upd', [e]);
    useAgentLoopStore.getState().updateActionLogEntry('msg-upd', 'e-upd', {
      status: 'success',
      title: 'After',
    });
    const updated = selectActionLog('msg-upd')(useAgentLoopStore.getState())[0]!;
    expect(updated.status).toBe('success');
    expect(updated.title).toBe('After');
  });

  it('updateActionLogEntry is no-op for unknown id', () => {
    const e = makeEntry({ id: 'e-known' });
    useAgentLoopStore.getState().setActionLog('msg-3', [e]);
    useAgentLoopStore.getState().updateActionLogEntry('msg-3', 'e-unknown', { status: 'failed' });
    expect(selectActionLog('msg-3')(useAgentLoopStore.getState())[0]!.status).toBe('running');
  });

  it('clearActionLog removes a message bucket', () => {
    const e = makeEntry();
    useAgentLoopStore.getState().setActionLog('msg-clear', [e]);
    useAgentLoopStore.getState().clearActionLog('msg-clear');
    expect(selectActionLog('msg-clear')(useAgentLoopStore.getState())).toEqual([]);
  });

  it('stores are independent per messageId', () => {
    useAgentLoopStore.getState().setActionLog('msg-a', [makeEntry({ id: 'a1' })]);
    useAgentLoopStore
      .getState()
      .setActionLog('msg-b', [makeEntry({ id: 'b1' }), makeEntry({ id: 'b2' })]);
    expect(selectActionLog('msg-a')(useAgentLoopStore.getState())).toHaveLength(1);
    expect(selectActionLog('msg-b')(useAgentLoopStore.getState())).toHaveLength(2);
  });
});
