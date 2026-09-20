import { describe, expect, it } from 'vitest';
import { AGENT_TASK_STATE_LABELS, TERMINAL_AGENT_TASK_STATES } from '@agiworkforce/types';
import {
  isArchivableState,
  isCancellableState,
  isLiveTaskState,
  isPausableState,
  taskStateLabel,
  taskStateTone,
  type AgentTaskState,
  type TaskStateTone,
} from '../task-display';

/**
 * The Task Center decides what a run looks like and which controls it offers
 * from its own reading of the run vocabulary. That reading is written out by
 * hand here and in the engine, so it is pinned against the shared contract:
 * a state added to the engine that this file does not answer for would show as
 * a grey badge with a Stop button that does nothing.
 */
const DECLARED = Object.keys(AGENT_TASK_STATE_LABELS) as AgentTaskState[];
const ENDED = (state: AgentTaskState): boolean =>
  (TERMINAL_AGENT_TASK_STATES as ReadonlySet<string>).has(state);

/**
 * A run that has not ended must never read as finished, and a run that has
 * ended must never read as working. `ready_for_review` and `partial` are
 * endings that still want the reader, so `attention` belongs to both sides.
 */
const ENDED_ONLY_TONES: TaskStateTone[] = ['success', 'danger', 'muted'];

describe('the Task Center answers for every state a run can be in', () => {
  it('has more than the states a client built before Work knew about', () => {
    expect(DECLARED.length).toBeGreaterThanOrEqual(14);
  });

  it.each(DECLARED)('labels %s with the shared wording', (state) => {
    expect(taskStateLabel(state)).toBe(AGENT_TASK_STATE_LABELS[state]);
    expect(taskStateLabel(state)).not.toBe('');
  });

  it.each(DECLARED)('gives %s a tone that matches whether it has ended', (state) => {
    const tone = taskStateTone(state);
    if (ENDED(state)) expect(tone).not.toBe('active');
    else expect(ENDED_ONLY_TONES).not.toContain(tone);
  });

  it('reads a run still working as working, and never as a grey default', () => {
    for (const state of DECLARED.filter(isPausableState)) {
      expect(taskStateTone(state)).toBe('active');
    }
    for (const state of DECLARED.filter(
      (entry) => isLiveTaskState(entry) && !isPausableState(entry),
    )) {
      expect(taskStateTone(state)).toBe('attention');
    }
  });

  it('offers Stop for exactly the runs that have not ended', () => {
    for (const state of DECLARED) {
      expect(isCancellableState(state)).toBe(!ENDED(state));
    }
  });

  it('polls a run for new events only while one can still arrive', () => {
    for (const state of DECLARED) {
      if (ENDED(state)) expect(isLiveTaskState(state)).toBe(false);
    }
    expect(isLiveTaskState('ready_for_review')).toBe(false);
    expect(isLiveTaskState('awaiting_input')).toBe(true);
  });

  it('splits every live state into one a worker drives and one parked on a person', () => {
    const parked = DECLARED.filter((state) => isLiveTaskState(state) && !isPausableState(state));
    const driven = DECLARED.filter(isPausableState);
    expect([...parked].sort()).toEqual(['awaiting_approval', 'awaiting_input', 'paused']);
    expect([...driven].sort()).toEqual(['planning', 'queued', 'resuming', 'running']);
    for (const state of [...parked, ...driven]) expect(ENDED(state)).toBe(false);
  });

  it('shelves only work that has stopped, and never shelves it twice', () => {
    for (const state of DECLARED) {
      if (!ENDED(state)) expect(isArchivableState(state)).toBe(false);
    }
    expect(isArchivableState('archived')).toBe(false);
    expect(DECLARED.filter(isArchivableState).sort()).toEqual(
      [...TERMINAL_AGENT_TASK_STATES].filter((state) => state !== 'archived').sort(),
    );
  });
});
