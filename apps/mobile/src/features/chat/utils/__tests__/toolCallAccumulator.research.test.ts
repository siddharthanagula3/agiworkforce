import {
  createToolCallAccumulator,
  seedToolCallAccumulator,
  accumulateToolCallDelta,
  toolCallList,
  RESEARCH_TOOL_KEY,
  RESEARCH_TOOL_NAME,
} from '../toolCallAccumulator';
import type { StreamDelta } from '@/services/streaming';

function run(deltas: unknown[]) {
  const acc = createToolCallAccumulator();
  for (const d of deltas) accumulateToolCallDelta(acc, d as StreamDelta);
  return toolCallList(acc);
}

const SEARCHING = {
  x_research_status: {
    phase: 'searching',
    label: 'Searching the web',
    iteration: 2,
    max_iterations: 3,
    searches: 5,
    max_searches: 12,
    sources: 8,
    elapsed_ms: 21_000,
  },
};

describe('toolCallAccumulator research progress', () => {
  it('renders x_research_status as one running timeline entry with phase and counts', () => {
    const tools = run([SEARCHING]);

    expect(tools).toHaveLength(1);
    expect(tools[0].id).toBe(RESEARCH_TOOL_KEY);
    expect(tools[0].name).toBe(RESEARCH_TOOL_NAME);
    expect(tools[0].status).toBe('running');
    expect(tools[0].duration).toBe(21_000);
    expect(tools[0].output).toContain('Searching the web');
    expect(tools[0].output).toContain('round 2 of 3');
    expect(tools[0].output).toContain('5 of 12 searches');
    expect(tools[0].output).toContain('8 sources');
  });

  it('keeps one entry across phases and carries counts forward when a phase omits them', () => {
    const tools = run([
      { x_research_status: { phase: 'planning', label: 'Planning research' } },
      SEARCHING,
      { x_research_status: { phase: 'complete', label: 'Research complete', elapsed_ms: 44_000 } },
    ]);

    expect(tools).toHaveLength(1);
    expect(tools[0].status).toBe('completed');
    expect(tools[0].duration).toBe(44_000);
    expect(tools[0].output).toContain('Research complete');
    expect(tools[0].output).toContain('8 sources');
  });

  it('marks an errored run failed', () => {
    const tools = run([
      SEARCHING,
      { x_research_status: { phase: 'error', label: 'Research provider unavailable' } },
    ]);

    expect(tools[0].status).toBe('failed');
    expect(tools[0].output).toContain('Research provider unavailable');
  });

  it('renders x_research_plan steps and replaces them on the next plan snapshot', () => {
    const acc = createToolCallAccumulator();
    accumulateToolCallDelta(acc, {
      x_research_plan: {
        steps: [
          { id: 's1', type: 'search', description: 'Find 2026 pricing', status: 'running' },
          { id: 's2', type: 'synthesize', description: 'Write the report', status: 'pending' },
        ],
      },
    } as unknown as StreamDelta);

    let tools = toolCallList(acc);
    expect(tools).toHaveLength(1);
    expect(tools[0].status).toBe('running');
    expect(tools[0].output).toContain('▸ Find 2026 pricing');
    expect(tools[0].output).toContain('· Write the report');

    accumulateToolCallDelta(acc, {
      x_research_plan: {
        steps: [
          { id: 's1', type: 'search', description: 'Find 2026 pricing', status: 'completed' },
          { id: 's2', type: 'synthesize', description: 'Write the report', status: 'running' },
        ],
      },
    } as unknown as StreamDelta);

    tools = toolCallList(acc);
    expect(tools).toHaveLength(1);
    expect(tools[0].output).toContain('✓ Find 2026 pricing');
    expect(tools[0].output).toContain('▸ Write the report');
  });

  it('ignores malformed research payloads and unrelated deltas', () => {
    expect(run([{ x_research_status: { phase: 'daydreaming' } }])).toHaveLength(0);
    expect(run([{ x_research_plan: { steps: [{ id: 's1' }] } }])).toHaveLength(0);
    expect(run([{ x_research_plan: 'plan' }])).toHaveLength(0);
    expect(
      run([
        { x_tool_status: { type: 'server_tool_use', name: 'web_search', status: 'searching' } },
      ]),
    ).toHaveLength(1);
  });

  it('updates the persisted research entry in place after a reseed', () => {
    const acc = createToolCallAccumulator();
    accumulateToolCallDelta(acc, SEARCHING as unknown as StreamDelta);
    const reseeded = seedToolCallAccumulator(toolCallList(acc));
    accumulateToolCallDelta(reseeded, {
      x_research_status: { phase: 'complete', label: 'Research complete' },
    } as unknown as StreamDelta);

    const tools = toolCallList(reseeded);
    expect(tools).toHaveLength(1);
    expect(tools[0].status).toBe('completed');
  });

  it('does not steal a following search result block', () => {
    const tools = run([
      SEARCHING,
      { x_tool_status: { type: 'server_tool_use', name: 'web_search', status: 'searching' } },
      {
        x_search_results: {
          type: 'web_search_tool_result',
          content: [{ type: 'web_search_result', title: 'Result', url: 'https://example.com' }],
        },
      },
    ]);

    expect(tools).toHaveLength(2);
    const research = tools.find((t) => t.id === RESEARCH_TOOL_KEY);
    expect(research?.output).not.toContain('example.com');
    expect(tools.find((t) => t.name === 'web_search')?.searchResults).toHaveLength(1);
  });
});
