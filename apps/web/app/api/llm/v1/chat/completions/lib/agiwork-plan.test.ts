import { describe, expect, it } from 'vitest';
import {
  AGIWORK_GOAL_PROGRESS_ID,
  AGIWORK_PLAN_PROGRESS_ID_PREFIX,
  advanceAgiWorkPlan,
  agiWorkGoalProgressEvent,
  agiWorkPlanEvent,
  agiWorkPlanProgressEvents,
  agiWorkPlanningDirective,
  buildAgiWorkPlan,
  parseAgiWorkGoal,
  parseAgiWorkPlanSteps,
  type AgiWorkPlanStep,
} from './agiwork-plan';

describe('parseAgiWorkGoal', () => {
  it('accepts a goal with optional scope fields and trims them', () => {
    expect(
      parseAgiWorkGoal({ goal: '  Build a report  ', constraints: ' no PDFs ', deliverable: '' }),
    ).toEqual({ goal: 'Build a report', constraints: 'no PDFs' });
  });

  it('rejects an empty or non-object goal', () => {
    expect(parseAgiWorkGoal({ goal: '   ' })).toBeNull();
    expect(parseAgiWorkGoal(null)).toBeNull();
    expect(parseAgiWorkGoal('build a thing')).toBeNull();
    expect(parseAgiWorkGoal({})).toBeNull();
  });

  it('bounds an over-long goal by rejecting it rather than truncating silently', () => {
    expect(parseAgiWorkGoal({ goal: 'x'.repeat(2001) })).toBeNull();
  });
});

describe('parseAgiWorkPlanSteps', () => {
  it('parses a JSON array of strings', () => {
    expect(parseAgiWorkPlanSteps('["a", "b", "c"]')).toEqual(['a', 'b', 'c']);
  });

  it('parses a JSON array embedded in prose/code fences', () => {
    expect(parseAgiWorkPlanSteps('Here is the plan:\n```json\n["first","second"]\n```')).toEqual([
      'first',
      'second',
    ]);
  });

  it('falls back to a numbered/bulleted list when JSON is absent', () => {
    expect(parseAgiWorkPlanSteps('1. Research\n2) Draft\n- Review')).toEqual([
      'Research',
      'Draft',
      'Review',
    ]);
  });

  it('returns an empty plan for unparseable text so nothing is invented', () => {
    expect(parseAgiWorkPlanSteps('I will just get started.')).toEqual([]);
  });

  it('caps the number of steps', () => {
    const many = JSON.stringify(Array.from({ length: 20 }, (_, i) => `step ${i}`));
    expect(parseAgiWorkPlanSteps(many).length).toBeLessThanOrEqual(6);
  });
});

describe('advanceAgiWorkPlan', () => {
  const base = (): AgiWorkPlanStep[] => buildAgiWorkPlan(['a', 'b', 'c']);

  it('start marks only the first pending step in progress', () => {
    const started = advanceAgiWorkPlan(base(), 'start');
    expect(started.map((s) => s.status)).toEqual(['in_progress', 'pending', 'pending']);
  });

  it('complete resolves every non-terminal step', () => {
    const done = advanceAgiWorkPlan(advanceAgiWorkPlan(base(), 'start'), 'complete');
    expect(done.every((s) => s.status === 'completed')).toBe(true);
  });

  it('fail marks the in-progress step failed and leaves untouched steps pending', () => {
    const failed = advanceAgiWorkPlan(advanceAgiWorkPlan(base(), 'start'), 'fail');
    expect(failed.map((s) => s.status)).toEqual(['failed', 'pending', 'pending']);
  });
});

describe('agiWorkPlanEvent (additive x_agiwork_plan wire)', () => {
  it('emits the whole plan as an SSE frame with snake_case status', () => {
    const steps = advanceAgiWorkPlan(buildAgiWorkPlan(['do a thing']), 'start');
    const frame = agiWorkPlanEvent(steps, 'gpt-5.6-sol');
    expect(frame.startsWith('data: ')).toBe(true);
    expect(frame.endsWith('\n\n')).toBe(true);
    const payload = JSON.parse(frame.slice('data: '.length));
    expect(payload.model).toBe('gpt-5.6-sol');
    expect(payload.choices[0].delta.x_agiwork_plan.steps).toEqual([
      { id: 'agiwork-plan-1', description: 'do a thing', status: 'in_progress' },
    ]);
  });
});

describe('reserved progress-id wire contract', () => {
  // TaskDetailPanel (packages/ui/unified-chat) hardcodes these SAME literals to
  // lift the goal + plan out of the progress list. They are the cross-package
  // wire contract; changing either side without the other silently breaks the
  // /tasks Goal + Plan sections. Pin them here so a rename cannot pass unnoticed.
  it('keeps the goal + plan progress ids stable', () => {
    expect(AGIWORK_GOAL_PROGRESS_ID).toBe('agiwork:goal');
    expect(AGIWORK_PLAN_PROGRESS_ID_PREFIX).toBe('agiwork:plan:');
  });
});

describe('durable journal events', () => {
  it('carries the goal under the reserved progress id, folding scope into detail', () => {
    const event = agiWorkGoalProgressEvent({
      goal: 'Ship the thing',
      constraints: 'no external deps',
      deliverable: 'a PR',
    });
    expect(event).toMatchObject({
      type: 'progress-update',
      progressId: AGIWORK_GOAL_PROGRESS_ID,
      summary: 'Ship the thing',
    });
    if (event.type === 'progress-update') {
      expect(event.detail).toContain('Constraints: no external deps');
      expect(event.detail).toContain('Deliverable: a PR');
    }
  });

  it('carries each plan step under the reserved plan prefix', () => {
    const events = agiWorkPlanProgressEvents(buildAgiWorkPlan(['a', 'b']));
    expect(events).toHaveLength(2);
    for (const event of events) {
      expect(event.type).toBe('progress-update');
      if (event.type === 'progress-update') {
        expect(event.progressId.startsWith(AGIWORK_PLAN_PROGRESS_ID_PREFIX)).toBe(true);
      }
    }
  });
});

describe('agiWorkPlanningDirective', () => {
  it('threads the goal and its scope fields into the directive', () => {
    const directive = agiWorkPlanningDirective({
      goal: 'Summarise Q3',
      constraints: 'cite sources',
      deliverable: 'a one-pager',
    });
    expect(directive).toContain('Summarise Q3');
    expect(directive).toContain('cite sources');
    expect(directive).toContain('a one-pager');
    expect(directive).toContain('JSON array');
  });
});
