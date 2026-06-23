/**
 * Tool-call accumulator — verifies the parse+accumulate layer that turns the
 * server's tool-call SSE deltas into the ToolCall[] MessageBubble renders.
 *
 * Sequences mirror the real server emission (stream-transform.ts for server
 * tools, tool-loop.ts for MCP) so this fails if the wiring drifts.
 */
import {
  createToolCallAccumulator,
  accumulateToolCallDelta,
  toolCallList,
} from '@/src/features/chat/utils/toolCallAccumulator';
import type { StreamDelta } from '@/services/streaming';

function run(deltas: StreamDelta[]) {
  const acc = createToolCallAccumulator();
  for (const d of deltas) accumulateToolCallDelta(acc, d);
  return toolCallList(acc);
}

describe('toolCallAccumulator', () => {
  it('accumulates a SERVER web_search tool into one running→completed entry', () => {
    // Real order: status(searching) -> arg fragments(by index, no id) -> result block.
    const tools = run([
      { x_tool_status: { type: 'server_tool_use', name: 'web_search', status: 'searching' } },
      { tool_calls: [{ index: 1, function: { arguments: '{"query":"AGI ' } }] },
      { tool_calls: [{ index: 1, function: { arguments: 'Workforce"}' } }] },
      {
        x_search_results: {
          type: 'web_search_tool_result',
          tool_use_id: 'srvtoolu_1',
          content: [{ title: 'Result', url: 'https://example.com' }],
        },
      },
    ]);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('web_search');
    expect(tools[0].input).toBe('{"query":"AGI Workforce"}');
    expect(tools[0].status).toBe('completed');
    expect(tools[0].output).toContain('example.com');
  });

  it('accumulates a SERVER code-execution tool and completes it', () => {
    const tools = run([
      { x_tool_status: { type: 'server_tool_use', name: 'code_execution', status: 'executing' } },
      { tool_calls: [{ index: 0, function: { arguments: '{"code":"print(2+2)"}' } }] },
      { x_code_result: { type: 'code_execution_tool_result', tool_use_id: 'c1', content: '4' } },
    ]);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('code_execution');
    expect(tools[0].status).toBe('completed');
    expect(tools[0].output).toContain('4');
  });

  it('accumulates an MCP tool (id-keyed) without forking a name duplicate', () => {
    // MCP order: tool_calls start (id+name) -> arg frags -> status(running) -> result.
    const tools = run([
      {
        tool_calls: [
          {
            index: 0,
            id: 'toolu_abc',
            type: 'function',
            function: { name: 'get_weather', arguments: '' },
          },
        ],
      },
      { tool_calls: [{ index: 0, function: { arguments: '{"city":"SF"}' } }] },
      { x_tool_status: { type: 'mcp_tool_use', name: 'get_weather', status: 'running' } },
      {
        x_tool_result: {
          tool_call_id: 'toolu_abc',
          name: 'get_weather',
          content: '72F sunny',
          is_error: false,
        },
      },
    ]);

    expect(tools).toHaveLength(1); // NOT 2 — status must not fork a name-keyed dup
    expect(tools[0].name).toBe('get_weather');
    expect(tools[0].input).toBe('{"city":"SF"}');
    expect(tools[0].status).toBe('completed');
    expect(tools[0].output).toBe('72F sunny');
  });

  it('marks an MCP tool failed when is_error is true', () => {
    const tools = run([
      { tool_calls: [{ index: 0, id: 't1', function: { name: 'do_thing', arguments: '{}' } }] },
      { x_tool_result: { tool_call_id: 't1', content: 'boom', is_error: true } },
    ]);
    expect(tools[0].status).toBe('failed');
  });

  it('keeps two distinct tools separate', () => {
    const tools = run([
      { x_tool_status: { type: 'server_tool_use', name: 'web_search', status: 'searching' } },
      { tool_calls: [{ index: 1, function: { arguments: '{"q":"a"}' } }] },
      { x_search_results: { type: 'web_search_tool_result', tool_use_id: 's1', content: [] } },
      {
        tool_calls: [{ index: 2, id: 'toolu_x', function: { name: 'fetch_url', arguments: '{}' } }],
      },
      { x_tool_result: { tool_call_id: 'toolu_x', content: 'ok' } },
    ]);
    expect(tools.map((t) => t.name)).toEqual(['web_search', 'fetch_url']);
  });

  it('surfaces an MCP approval request as a running step', () => {
    const tools = run([
      {
        x_tool_approval_request: {
          tool_call_id: 'ap1',
          name: 'delete_file',
          args: { path: '/tmp/x' },
        },
      },
    ]);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('delete_file');
    expect(tools[0].status).toBe('running');
    expect(tools[0].input).toContain('/tmp/x');
  });

  it('ignores plain content/finish deltas (no tool noise)', () => {
    const tools = run([{ content: 'hello' }, { reasoning: 'thinking' }, { finish_reason: 'stop' }]);
    expect(tools).toHaveLength(0);
  });
});
