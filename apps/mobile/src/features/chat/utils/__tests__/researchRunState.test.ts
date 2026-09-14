import type { StreamDelta } from '@/services/streaming';
import {
  approvedResearchSteps,
  completedResearchSteps,
  reduceResearchDelta,
  researchCountsSummary,
  researchResumePayload,
  settleResearchRun,
  readResearchRunState,
  type ResearchRunState,
} from '../researchRunState';

const NOW = '2026-09-13T00:00:00.000Z';

function reduce(deltas: StreamDelta[]): ResearchRunState | undefined {
  let state: ResearchRunState | undefined;
  for (const delta of deltas) {
    const next = reduceResearchDelta(state, delta, NOW);
    if (next) state = next;
  }
  return state;
}

describe('reduceResearchDelta', () => {
  it('ignores a delta with no research fields', () => {
    expect(reduceResearchDelta(undefined, { content: 'hello' } as StreamDelta, NOW)).toBeNull();
  });

  it('builds a paused plan from the plan and status events', () => {
    const state = reduce([
      {
        x_research_plan: {
          steps: [
            { id: 's1', type: 'search', description: 'Find the spec', status: 'pending' },
            { id: 's2', type: 'search', description: 'Find benchmarks', status: 'pending' },
          ],
        },
      } as StreamDelta,
      {
        x_research_status: {
          phase: 'awaiting_approval',
          label: 'Review the plan',
          max_iterations: 6,
          max_searches: 12,
        },
      } as StreamDelta,
    ]);

    expect(state?.phase).toBe('awaiting_approval');
    expect(state?.label).toBe('Review the plan');
    expect(state?.steps).toHaveLength(2);
    expect(state?.startedAt).toBe(NOW);
    expect(approvedResearchSteps(state?.steps)).toHaveLength(2);
  });

  it('tracks progress counts and accumulates deduped sources', () => {
    const state = reduce([
      { x_research_status: { phase: 'searching', iteration: 2, max_iterations: 6 } } as StreamDelta,
      {
        x_search_results: {
          content: [
            { type: 'web_search_result', url: 'https://a.example', title: 'A' },
            { type: 'web_search_result', url: 'https://b.example', title: 'B' },
            { type: 'other', url: 'https://c.example' },
          ],
        },
      } as StreamDelta,
      {
        x_search_results: {
          content: [
            { type: 'web_search_result', url: 'https://a.example', title: 'A' },
            { type: 'web_search_result', url: 'https://d.example', title: 'D' },
          ],
        },
      } as StreamDelta,
      {
        x_research_status: {
          phase: 'searching',
          searches: 4,
          max_searches: 12,
          sources: 3,
          elapsed_ms: 21_000,
        },
      } as StreamDelta,
    ]);

    expect(state?.phase).toBe('searching');
    expect(state?.sourcesForRetry?.map((source) => source.url)).toEqual([
      'https://a.example',
      'https://b.example',
      'https://d.example',
    ]);
    expect(researchCountsSummary(state!)).toEqual([
      'round 2 of 6',
      '4 of 12 searches',
      '3 sources',
    ]);
  });

  it('reaches the report phase and stops counting against the budget', () => {
    const state = reduce([
      { x_research_status: { phase: 'synthesizing' } } as StreamDelta,
      {
        x_research_status: {
          phase: 'complete',
          label: 'Research complete',
          searches: 5,
          max_searches: 12,
          sources: 9,
          elapsed_ms: 64_000,
        },
      } as StreamDelta,
    ]);

    expect(state?.phase).toBe('complete');
    expect(researchCountsSummary(state!)).toEqual(['5 searches', '9 sources']);
  });

  it('records the failure label as the run error', () => {
    const state = reduce([
      { x_research_status: { phase: 'searching' } } as StreamDelta,
      {
        x_research_status: { phase: 'error', label: 'Research provider unavailable' },
      } as StreamDelta,
    ]);

    expect(state?.phase).toBe('error');
    expect(state?.error).toBe('Research provider unavailable');
  });

  it('replaces the plan on each plan snapshot rather than appending', () => {
    const state = reduce([
      {
        x_research_plan: {
          steps: [{ id: 's1', type: 'search', description: 'One', status: 'pending' }],
        },
      } as StreamDelta,
      {
        x_research_plan: {
          steps: [
            { id: 's1', type: 'search', description: 'One', status: 'completed' },
            { id: 's2', type: 'search', description: 'Two', status: 'running' },
            {
              id: 's3',
              type: 'search',
              description: 'Three',
              status: 'dropped',
              note: 'Budget spent',
            },
          ],
        },
      } as StreamDelta,
    ]);

    expect(state?.steps).toHaveLength(3);
    expect(completedResearchSteps(state?.steps).map((step) => step.id)).toEqual(['s1']);
    expect(state?.steps?.[2]?.note).toBe('Budget spent');
  });
});

describe('settleResearchRun', () => {
  it('marks a live run interrupted when the user stops it', () => {
    const settled = settleResearchRun({ phase: 'searching' }, 'interrupted');
    expect(settled?.phase).toBe('interrupted');
    expect(settled?.label).toBe('Research stopped');
  });

  it('marks a live run failed with the visible error', () => {
    const settled = settleResearchRun({ phase: 'synthesizing' }, 'error', 'Network died');
    expect(settled?.phase).toBe('error');
    expect(settled?.error).toBe('Network died');
  });

  it('leaves an already terminal run alone', () => {
    expect(settleResearchRun({ phase: 'complete' }, 'error', 'x')).toBeNull();
    expect(settleResearchRun({ phase: 'interrupted' }, 'error', 'x')).toBeNull();
    expect(settleResearchRun(undefined, 'interrupted')).toBeNull();
  });
});

describe('researchResumePayload', () => {
  it('carries gathered sources, completed steps, and the steps still owed', () => {
    const research: ResearchRunState = {
      phase: 'interrupted',
      sourcesForRetry: [{ url: 'https://a.example', title: 'A' }],
      steps: [
        { id: 's1', type: 'search', description: 'One', status: 'completed' },
        { id: 's2', type: 'search', description: 'Two', status: 'pending' },
        { id: 's3', type: 'synthesize', description: 'Write', status: 'pending' },
      ],
    };
    const payload = researchResumePayload(research);
    expect(payload.sources).toHaveLength(1);
    expect(payload.steps.map((step) => step.id)).toEqual(['s1']);
    expect(payload.approvedSteps.map((step) => step.id)).toEqual(['s2']);
  });
});

describe('readResearchRunState', () => {
  it('accepts a stored run and rejects anything without a known phase', () => {
    expect(readResearchRunState({ phase: 'complete' })?.phase).toBe('complete');
    expect(readResearchRunState({ phase: 'nonsense' })).toBeUndefined();
    expect(readResearchRunState(null)).toBeUndefined();
    expect(readResearchRunState([{ phase: 'complete' }])).toBeUndefined();
  });
});
