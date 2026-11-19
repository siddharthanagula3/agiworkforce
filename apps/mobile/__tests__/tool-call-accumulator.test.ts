import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';
import {
  createToolCallAccumulator,
  accumulateToolCallDelta,
  seedToolCallAccumulator,
  toolCallList,
} from '@/src/features/chat/utils/toolCallAccumulator';
import type { StreamDelta } from '@/services/streaming';

function run(deltas: StreamDelta[]) {
  const acc = createToolCallAccumulator();
  for (const d of deltas) accumulateToolCallDelta(acc, d);
  return toolCallList(acc);
}

describe('toolCallAccumulator', () => {
  it('accumulates a SERVER web_search tool into one running to succeeded entry', () => {
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
    expect(tools[0].status).toBe('succeeded');
    expect(tools[0].output).toContain('example.com');
  });

  it('never shows the opaque encrypted_content token as a search result snippet', () => {
    const tokenOnly = 'EqMDCioIBRgCIiQ3ZjFhYjQyNi1lM2Q5LTRhZTItOWQ3Ny0xYjZlNWNhZDhmMTAS'
      .repeat(3)
      .slice(0, 160);
    expect(tokenOnly).toHaveLength(160);
    const tools = run([
      { x_tool_status: { type: 'server_tool_use', name: 'web_search', status: 'searching' } },
      {
        x_search_results: {
          type: 'web_search_tool_result',
          tool_use_id: 'srvtoolu_2',
          content: [
            {
              type: 'web_search_result',
              url: 'https://example.com/a',
              title: 'Opaque',
              encrypted_content: tokenOnly,
            },
            {
              type: 'web_search_result',
              url: 'https://example.com/b',
              title: 'Readable',
              encrypted_content: tokenOnly,
              snippet: 'A short readable summary.',
            },
            {
              type: 'web_search_result',
              url: 'https://example.com/c',
              title: 'Token in snippet',
              snippet: tokenOnly,
            },
          ],
        },
      },
    ]);
    const results = tools[0].searchResults ?? [];
    expect(results).toHaveLength(3);
    expect(results[0]).not.toHaveProperty('snippet');
    expect(results[1].snippet).toBe('A short readable summary.');
    expect(results[2]).not.toHaveProperty('snippet');
    expect(JSON.stringify(results)).not.toContain(tokenOnly);
  });

  it('accumulates a SERVER code-execution tool and succeeds it', () => {
    const tools = run([
      { x_tool_status: { type: 'server_tool_use', name: 'code_execution', status: 'executing' } },
      { tool_calls: [{ index: 0, function: { arguments: '{"code":"print(2+2)"}' } }] },
      { x_code_result: { type: 'code_execution_tool_result', tool_use_id: 'c1', content: '4' } },
    ]);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('code_execution');
    expect(tools[0].status).toBe('succeeded');
    expect(tools[0].output).toContain('4');
  });

  it('marks a code execution error result as failed with a readable reason, not raw JSON', () => {
    const tools = run([
      { x_tool_status: { type: 'server_tool_use', name: 'code_execution', status: 'executing' } },
      {
        x_code_result: {
          type: 'code_execution_tool_result',
          tool_use_id: 'c2',
          content: {
            type: 'code_execution_tool_result_error',
            error_code: 'execution_time_exceeded',
          },
        },
      },
    ]);
    expect(tools).toHaveLength(1);
    expect(tools[0].status).toBe('failed');
    expect(tools[0].output).toBe('Code execution failed: execution time exceeded');
  });

  it('names an unknown error when the code execution error has no code', () => {
    const tools = run([
      {
        x_code_result: {
          type: 'code_execution_tool_result',
          tool_use_id: 'c3',
          content: { type: 'code_execution_tool_result_error' },
        },
      },
    ]);
    expect(tools[0].status).toBe('failed');
    expect(tools[0].output).toBe('Code execution failed: unknown error');
  });

  it('keeps stdout, stderr and a failing exit code apart', () => {
    const tools = run([
      {
        x_code_result: {
          type: 'code_execution_tool_result',
          tool_use_id: 'c4',
          content: {
            type: 'code_execution_result',
            stdout: 'partial\n',
            stderr: 'Traceback: boom',
            return_code: 1,
          },
        },
      },
    ]);
    expect(tools[0].status).toBe('failed');
    expect(tools[0].output).toBe('partial\n');
    expect(tools[0].stderr).toBe('Traceback: boom');
    expect(tools[0].exitCode).toBe(1);
  });

  it('accumulates an MCP tool (id-keyed) without forking a name duplicate', () => {
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

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('get_weather');
    expect(tools[0].input).toBe('{"city":"SF"}');
    expect(tools[0].status).toBe('succeeded');
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

  it('surfaces an MCP approval request as an awaiting-approval step', () => {
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
    expect(tools[0].status).toBe('awaiting-approval');
    expect(tools[0].requiresApproval).toBe(true);
    expect(tools[0].input).toContain('/tmp/x');
  });

  it('opens a request asked again under the id of a call the server already settled', () => {
    const tools = run([
      {
        tool_calls: [
          { index: 0, id: 'call_0', function: { name: 'web_search', arguments: '{"q":"a"}' } },
        ],
      },
      { x_tool_result: { tool_call_id: 'call_0', content: 'first result' } },
      {
        x_tool_approval_request: {
          tool_call_id: 'call_0',
          name: 'execute_code',
          args: { code: 'print(1)' },
        },
      },
    ]);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('execute_code');
    expect(tools[0].status).toBe('awaiting-approval');
    expect(tools[0].requiresApproval).toBe(true);
    expect(tools[0].input).toContain('print(1)');
    expect(tools[0].input).not.toContain('"q"');
    expect(tools[0].output).toBeUndefined();
  });

  describe('a result that arrives only through the run journal', () => {
    let sequence = 0;
    const executionEnd = (toolCallId: string, output: unknown, isError = false): StreamDelta => ({
      x_agent_event: {
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
        sessionId: 'session-journal',
        turnId: 'turn-journal',
        sequence: sequence++,
        emittedAtMs: 1_000 + sequence,
        event: {
          type: 'tool-execution-end',
          toolCallId,
          name: 'get_weather',
          output: output as never,
          isError,
        },
      },
      durableReplay: true,
    });
    const started: StreamDelta = {
      tool_calls: [
        { index: 0, id: 'toolu_j1', function: { name: 'get_weather', arguments: '{}' } },
      ],
    };

    it('settles a known call from the tool-execution-end event', () => {
      const tools = run([
        started,
        { x_tool_status: { type: 'mcp_tool_use', name: 'get_weather', status: 'running' } },
        executionEnd('toolu_j1', { forecast: 'sunny' }),
      ]);
      expect(tools).toHaveLength(1);
      expect(tools[0].status).toBe('succeeded');
      expect(tools[0].output).toContain('sunny');
      expect(tools[0].requiresApproval).toBe(false);
    });

    it('marks the call failed when the event carries an error', () => {
      const tools = run([started, executionEnd('toolu_j1', 'quota exceeded', true)]);
      expect(tools[0].status).toBe('failed');
      expect(tools[0].output).toBe('quota exceeded');
    });

    it('keeps the x_tool_result output when the event arrives after it', () => {
      const tools = run([
        started,
        { x_tool_result: { tool_call_id: 'toolu_j1', content: '72F sunny', is_error: false } },
        executionEnd('toolu_j1', 'a different late output', true),
      ]);
      expect(tools).toHaveLength(1);
      expect(tools[0].status).toBe('succeeded');
      expect(tools[0].output).toBe('72F sunny');
    });

    it('leaves a call that still awaits a decision untouched', () => {
      const tools = run([
        {
          x_tool_approval_request: { tool_call_id: 'toolu_j1', name: 'get_weather', args: {} },
        },
        executionEnd('toolu_j1', 'ran anyway'),
      ]);
      expect(tools[0].status).toBe('awaiting-approval');
      expect(tools[0].requiresApproval).toBe(true);
      expect(tools[0].output).toBeUndefined();
    });

    it('settles a call the person already approved', () => {
      const acc = seedToolCallAccumulator([
        {
          id: 'id:toolu_j1',
          toolCallId: 'toolu_j1',
          name: 'get_weather',
          status: 'awaiting-approval',
          requiresApproval: true,
          approvalDecision: 'approved',
        },
      ]);
      accumulateToolCallDelta(acc, executionEnd('toolu_j1', 'done'));
      const tools = toolCallList(acc);
      expect(tools[0].status).toBe('succeeded');
      expect(tools[0].output).toBe('done');
      expect(tools[0].requiresApproval).toBe(false);
    });

    it('does not invent a call it has never seen', () => {
      expect(run([executionEnd('toolu_unknown', 'orphan')])).toHaveLength(0);
    });

    it('settles a running call seeded from a paused turn under its id key', () => {
      const live = createToolCallAccumulator();
      accumulateToolCallDelta(live, started);
      const acc = seedToolCallAccumulator(toolCallList(live));
      accumulateToolCallDelta(acc, executionEnd('toolu_j1', 'resumed result'));
      const tools = toolCallList(acc);
      expect(tools).toHaveLength(1);
      expect(tools[0].status).toBe('succeeded');
      expect(tools[0].output).toBe('resumed result');
    });

    it('fills the output of a call whose completed status arrived without a result', () => {
      const tools = run([
        started,
        { x_tool_status: { type: 'mcp_tool_use', name: 'get_weather', status: 'completed' } },
        executionEnd('toolu_j1', 'journal output', true),
      ]);
      expect(tools).toHaveLength(1);
      expect(tools[0].status).toBe('succeeded');
      expect(tools[0].output).toBe('journal output');
    });

    it('leaves a code run that ended with empty output as it is', () => {
      const acc = seedToolCallAccumulator([
        {
          id: 'id:toolu_j1',
          toolCallId: 'toolu_j1',
          name: 'code_execution',
          status: 'succeeded',
          exitCode: 0,
        },
      ]);
      accumulateToolCallDelta(acc, executionEnd('toolu_j1', 'late output'));
      expect(toolCallList(acc)[0].output).toBeUndefined();
    });
  });

  it('ignores plain content/finish deltas (no tool noise)', () => {
    const tools = run([{ content: 'hello' }, { reasoning: 'thinking' }, { finish_reason: 'stop' }]);
    expect(tools).toHaveLength(0);
  });
});
