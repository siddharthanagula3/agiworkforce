import { describe, expect, it } from 'vitest';
import { agiWorkPlanProgress, buildAgiWorkGoalInput, parseAgiWorkPlanEvent } from './agiwork-plan';

describe('parseAgiWorkPlanEvent', () => {
  it('reduces a well-formed whole-plan payload (last-write-wins replace)', () => {
    const steps = parseAgiWorkPlanEvent({
      steps: [
        { id: 'agiwork-plan-1', description: 'gather data', status: 'completed' },
        { id: 'agiwork-plan-2', description: 'write it up', status: 'in_progress' },
      ],
    });
    expect(steps).toEqual([
      { id: 'agiwork-plan-1', description: 'gather data', status: 'completed' },
      { id: 'agiwork-plan-2', description: 'write it up', status: 'in_progress' },
    ]);
  });

  it('drops malformed steps rather than rendering them', () => {
    const steps = parseAgiWorkPlanEvent({
      steps: [
        { id: 'ok', description: 'valid', status: 'pending' },
        { id: 'bad-status', description: 'x', status: 'exploded' },
        { id: '', description: 'no id', status: 'pending' },
        { description: 'no id at all', status: 'pending' },
        { id: 'blank', description: '   ', status: 'pending' },
      ],
    });
    expect(steps).toEqual([{ id: 'ok', description: 'valid', status: 'pending' }]);
  });

  it('dedupes repeated ids, keeping the first', () => {
    const steps = parseAgiWorkPlanEvent({
      steps: [
        { id: 'dup', description: 'first', status: 'pending' },
        { id: 'dup', description: 'second', status: 'completed' },
      ],
    });
    expect(steps).toEqual([{ id: 'dup', description: 'first', status: 'pending' }]);
  });

  it('returns null for a payload with no usable step so a good plan is never erased', () => {
    expect(parseAgiWorkPlanEvent({ steps: [] })).toBeNull();
    expect(parseAgiWorkPlanEvent({ steps: 'nope' })).toBeNull();
    expect(parseAgiWorkPlanEvent(null)).toBeNull();
    expect(parseAgiWorkPlanEvent({})).toBeNull();
  });
});

describe('agiWorkPlanProgress', () => {
  it('counts completed vs total', () => {
    expect(
      agiWorkPlanProgress([
        { id: '1', description: 'a', status: 'completed' },
        { id: '2', description: 'b', status: 'in_progress' },
        { id: '3', description: 'c', status: 'pending' },
      ]),
    ).toEqual({ completed: 1, total: 3 });
    expect(agiWorkPlanProgress(undefined)).toEqual({ completed: 0, total: 0 });
  });
});

describe('buildAgiWorkGoalInput', () => {
  it('builds the objective from the message and drops empty scope fields', () => {
    expect(
      buildAgiWorkGoalInput('  Do the thing  ', { constraints: '  ', deliverable: ' a file ' }),
    ).toEqual({ goal: 'Do the thing', deliverable: 'a file' });
  });

  it('returns undefined for empty content so an empty send carries no goal', () => {
    expect(buildAgiWorkGoalInput('   ')).toBeUndefined();
  });
});
