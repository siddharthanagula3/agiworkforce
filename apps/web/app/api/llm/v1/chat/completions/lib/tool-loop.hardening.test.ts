/**
 * Hardening unit tests for tool-loop internals: read-only classification
 * (parallel-safety) and untrusted-provider-stream accumulation bounds.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  isReadOnlyTool,
  collectProviderStream,
  withToolTimeout,
  mapWithConcurrency,
  trimToolResultHistory,
  TOOL_LOOP_STREAM_LIMITS,
} from './tool-loop';

function sseStream(events: unknown[]): ReadableStream {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      }
      controller.enqueue(enc.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

function toolCallChunk(index: number, id: string, name: string, args: string) {
  return {
    choices: [
      {
        index: 0,
        delta: { tool_calls: [{ index, id, function: { name, arguments: args } }] },
        finish_reason: null,
      },
    ],
  };
}

function serverToolUseChunk(name: string) {
  return { choices: [{ delta: { x_tool_status: { type: 'server_tool_use', name } }, index: 0 }] };
}

function searchResultsChunk(content: unknown[]) {
  return { choices: [{ delta: { x_search_results: { content } }, index: 0 }] };
}

describe('isReadOnlyTool — driven by the declared tool metadata model', () => {
  it('treats declared read-class platform and connector tools as parallel-safe', () => {
    for (const name of ['web_search', 'url_fetch', 'skill', 'mcp__github__get_pull_request_diff']) {
      expect(isReadOnlyTool(name)).toBe(true);
    }
  });

  it('serialises writes, executions and external sends', () => {
    for (const name of [
      'execute_code',
      'write_file',
      'create_folder',
      'create_office_file',
      'mcp__github__post_issue_comment',
      'mcp__github__post_pull_request_review',
    ]) {
      expect(isReadOnlyTool(name)).toBe(false);
    }
  });

  it('serialises UNDECLARED MCP tools no matter how read-like the name looks', () => {
    for (const name of [
      'mcp__acme__get_and_archive',
      'mcp__acme__list_then_delete',
      'mcp__acme__search',
      'mcp__acme__query',
    ]) {
      expect(isReadOnlyTool(name)).toBe(false);
    }
  });
});

describe('collectProviderStream — untrusted accumulation bounds', () => {
  it('collects provider-native generated-file references from normalized SSE events', async () => {
    const { generatedFileRefs } = await collectProviderStream(
      sseStream([
        {
          x_code_result: {
            content: [{ type: 'code_execution_output', file_id: 'file_anthropic' }],
          },
        },
        {
          annotations: [
            {
              type: 'container_file_citation',
              file_id: 'file_openai',
              container_id: 'container_openai',
              filename: 'report.csv',
            },
          ],
        },
      ]),
    );

    expect(generatedFileRefs).toEqual([
      { provider: 'anthropic', fileId: 'file_anthropic' },
      {
        provider: 'openai',
        fileId: 'file_openai',
        containerId: 'container_openai',
        filename: 'report.csv',
      },
    ]);
  });

  it('re-mints duplicate provider tool_call ids so every accepted call is unique', async () => {
    const stream = sseStream([
      toolCallChunk(0, 'dup', 'get_a', '{}'),
      toolCallChunk(1, 'dup', 'get_b', '{}'),
    ]);
    const { pendingToolCalls } = await collectProviderStream(stream);
    expect(pendingToolCalls).toHaveLength(2);
    const ids = pendingToolCalls.map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('caps the number of tool calls accepted from one step', async () => {
    const events = Array.from(
      { length: TOOL_LOOP_STREAM_LIMITS.maxToolCallsPerStep + 10 },
      (_, i) => toolCallChunk(i, `id-${i}`, `get_${i}`, '{}'),
    );
    const { pendingToolCalls } = await collectProviderStream(sseStream(events));
    expect(pendingToolCalls.length).toBe(TOOL_LOOP_STREAM_LIMITS.maxToolCallsPerStep);
  });

  it('attributes one combined native search-results delta to only the first of several pending calls', async () => {
    const stream = sseStream([
      serverToolUseChunk('web_search'),
      serverToolUseChunk('web_search'),
      searchResultsChunk([
        { type: 'web_search_result', url: 'https://a.example', title: 'A' },
        { type: 'web_search_result', url: 'https://b.example', title: 'B' },
      ]),
    ]);

    const { lines } = await collectProviderStream(stream);
    const resolved = lines.flatMap((l) => l.serverToolResults ?? []);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]?.sources).toEqual([
      { url: 'https://a.example', title: 'A' },
      { url: 'https://b.example', title: 'B' },
    ]);
    expect(resolved[1]?.sources).toEqual([]);
    expect(resolved[0]?.toolCallId).not.toBe(resolved[1]?.toolCallId);
  });

  it('bounds accumulated tool-argument JSON per call', async () => {
    const huge = 'x'.repeat(TOOL_LOOP_STREAM_LIMITS.maxToolArgsJsonChars + 50_000);
    const chunks: unknown[] = [toolCallChunk(0, 'id-0', 'get_a', '')];
    for (let i = 0; i < huge.length; i += 10_000) {
      chunks.push(toolCallChunk(0, 'id-0', 'get_a', huge.slice(i, i + 10_000)));
    }
    const { pendingToolCalls } = await collectProviderStream(sseStream(chunks));
    const raw = pendingToolCalls[0]?.args['_raw'];
    expect(typeof raw).toBe('string');
    expect((raw as string).length).toBeLessThanOrEqual(
      TOOL_LOOP_STREAM_LIMITS.maxToolArgsJsonChars,
    );
  });
});

describe('withToolTimeout — per-tool-call wall-clock bound', () => {
  it('returns the tool result when it settles before the timeout', async () => {
    const r = await withToolTimeout(
      Promise.resolve({ content: 'ok', isError: false }),
      'my_tool',
      1000,
    );
    expect(r).toEqual({ content: 'ok', isError: false });
  });

  it('resolves to an error result when the tool hangs past the timeout (no reject)', async () => {
    vi.useFakeTimers();
    try {
      const hung = new Promise<{ content: string; isError: boolean }>(() => {
        /* never settles */
      });
      const p = withToolTimeout(hung, 'stuck_tool', 120_000);
      await vi.advanceTimersByTimeAsync(120_000);
      const r = await p;
      expect(r.isError).toBe(true);
      expect(r.content).toContain('timed out');
      expect(r.content).toContain('stuck_tool');
    } finally {
      vi.useRealTimers();
    }
  });

  it('converts a rejection into an error result (one tool cannot crash the batch)', async () => {
    const r = await withToolTimeout(Promise.reject(new Error('boom')), 'bad_tool', 1000);
    expect(r.isError).toBe(true);
    expect(r.content).toContain('boom');
  });
});

describe('mapWithConcurrency — bounded parallel tool fan-out', () => {
  it('never runs more than `limit` at once and preserves order', async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);
    const out = await mapWithConcurrency(items, 4, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(out).toEqual(items.map((n) => n * 2));
  });

  it('handles an empty list and a single item', async () => {
    expect(await mapWithConcurrency([], 4, async (n) => n)).toEqual([]);
    expect(await mapWithConcurrency([7], 4, async (n) => n + 1)).toEqual([8]);
  });
});

describe('trimToolResultHistory — bound accumulated tool-result context', () => {
  interface TestMsg {
    role: string;
    content: unknown;
    tool_call_id?: string;
    tool_calls?: Array<{ id: string }>;
  }
  const sys: TestMsg = { role: 'system', content: 'you are helpful' };
  const user: TestMsg = { role: 'user', content: 'do a big research task' };
  const toolMsg = (id: string, size: number): TestMsg => ({
    role: 'tool',
    content: 'x'.repeat(size),
    tool_call_id: id,
  });
  const asst = (id: string): TestMsg => ({ role: 'assistant', content: '', tool_calls: [{ id }] });

  it('is a no-op when total tool content is under budget', () => {
    const msgs: TestMsg[] = [sys, user, asst('a'), toolMsg('a', 100)];
    expect(trimToolResultHistory(msgs, 10_000, 2)).toBe(0);
    expect(msgs[3]!.content).toBe('x'.repeat(100));
  });

  it('truncates the OLDEST results first, keeps the most recent verbatim, drops no message', () => {
    const msgs: TestMsg[] = [
      sys,
      user,
      asst('t1'),
      toolMsg('t1', 1000),
      asst('t2'),
      toolMsg('t2', 1000),
      asst('t3'),
      toolMsg('t3', 1000),
      asst('t4'),
      toolMsg('t4', 1000),
      asst('t5'),
      toolMsg('t5', 1000),
    ];
    const lenBefore = msgs.length;
    const truncated = trimToolResultHistory(msgs, 2500, 2);

    expect(truncated).toBeGreaterThan(0);
    expect(msgs.length).toBe(lenBefore);
    expect(msgs.find((m) => m.tool_call_id === 't4')!.content).toBe('x'.repeat(1000));
    expect(msgs.find((m) => m.tool_call_id === 't5')!.content).toBe('x'.repeat(1000));
    expect(msgs.find((m) => m.tool_call_id === 't1')!.content).toContain('omitted');
    expect(msgs[0]).toBe(sys);
    expect(msgs[1]).toBe(user);
    const retained = msgs
      .filter((m) => m.role === 'tool')
      .reduce((sum, m) => sum + String(m.content).length, 0);
    expect(retained).toBeLessThanOrEqual(2500);
  });

  it('leaves non-string (multimodal) tool content alone', () => {
    const parts = [{ type: 'image', url: 'data:...' }];
    const msgs: TestMsg[] = [
      sys,
      asst('m'),
      { role: 'tool', content: parts, tool_call_id: 'm' },
      asst('big'),
      toolMsg('big', 5000),
    ];
    trimToolResultHistory(msgs, 100, 0);
    expect(msgs[2]!.content).toBe(parts);
  });
});
