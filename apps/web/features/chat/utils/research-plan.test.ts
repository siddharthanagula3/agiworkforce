import { describe, expect, it } from 'vitest';

import { completedResearchSteps, parseResearchPlanEvent } from './research-plan';

const WIRE_STEP = {
  id: 'plan-1',
  type: 'search',
  description: 'query one',
  status: 'running',
};

describe('parseResearchPlanEvent', () => {
  it('maps the snake_case wire payload onto ResearchStep', () => {
    expect(
      parseResearchPlanEvent({
        steps: [
          {
            ...WIRE_STEP,
            status: 'completed',
            started_at: '2026-08-05T10:00:00.000Z',
            completed_at: '2026-08-05T10:00:02.000Z',
            duration_ms: 2000,
            sources_consulted: 4,
          },
        ],
      }),
    ).toEqual([
      {
        id: 'plan-1',
        type: 'search',
        description: 'query one',
        status: 'completed',
        startedAt: '2026-08-05T10:00:00.000Z',
        completedAt: '2026-08-05T10:00:02.000Z',
        durationMs: 2000,
        sourcesConsulted: 4,
      },
    ]);
  });

  it('replaces the whole plan (last-write-wins) so a late joiner is consistent', () => {
    const first = parseResearchPlanEvent({ steps: [WIRE_STEP] });
    const second = parseResearchPlanEvent({
      steps: [
        { ...WIRE_STEP, status: 'completed' },
        { id: 'synthesize', type: 'synthesize', description: 'Write report', status: 'running' },
      ],
    });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    expect(second?.[0]?.status).toBe('completed');
  });

  it('drops malformed steps instead of rendering them', () => {
    expect(
      parseResearchPlanEvent({
        steps: [
          WIRE_STEP,
          { ...WIRE_STEP, id: 'plan-2', type: 'browse' },
          { ...WIRE_STEP, id: 'plan-3', status: 'queued' },
          { ...WIRE_STEP, id: '' },
          null,
          'plan-4',
        ],
      }),
    ).toEqual([{ id: 'plan-1', type: 'search', description: 'query one', status: 'running' }]);
  });

  it('drops duplicate ids so one step cannot render twice', () => {
    const steps = parseResearchPlanEvent({
      steps: [WIRE_STEP, { ...WIRE_STEP, description: 'shadow' }],
    });
    expect(steps).toHaveLength(1);
    expect(steps?.[0]?.description).toBe('query one');
  });

  it('ignores non-numeric timing fields rather than storing NaN', () => {
    const steps = parseResearchPlanEvent({
      steps: [{ ...WIRE_STEP, duration_ms: 'soon', sources_consulted: Number.NaN }],
    });
    expect(steps?.[0]).not.toHaveProperty('durationMs');
    expect(steps?.[0]).not.toHaveProperty('sourcesConsulted');
  });

  it('returns null for anything unusable so a bad event cannot erase a good plan', () => {
    expect(parseResearchPlanEvent(null)).toBeNull();
    expect(parseResearchPlanEvent('plan')).toBeNull();
    expect(parseResearchPlanEvent({})).toBeNull();
    expect(parseResearchPlanEvent({ steps: 'nope' })).toBeNull();
    expect(parseResearchPlanEvent({ steps: [] })).toBeNull();
    expect(parseResearchPlanEvent({ steps: [{ id: 'x' }] })).toBeNull();
  });

  it('bounds an oversized plan', () => {
    const steps = parseResearchPlanEvent({
      steps: Array.from({ length: 200 }, (_, i) => ({ ...WIRE_STEP, id: `plan-${i}` })),
    });
    expect(steps).toHaveLength(50);
  });
});

describe('completedResearchSteps', () => {
  it('keeps only completed search steps (the queries a retry must not redo)', () => {
    expect(
      completedResearchSteps([
        { id: 'a', type: 'search', description: 'done', status: 'completed' },
        { id: 'b', type: 'search', description: 'pending', status: 'pending' },
        { id: 'c', type: 'search', description: 'failed', status: 'failed' },
        { id: 'd', type: 'synthesize', description: 'report', status: 'completed' },
      ]),
    ).toEqual([{ id: 'a', type: 'search', description: 'done', status: 'completed' }]);
  });

  it('handles an absent plan', () => {
    expect(completedResearchSteps(undefined)).toEqual([]);
  });
});
