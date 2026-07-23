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

describe('isReadOnlyTool — prefix match only (no substring false positives)', () => {
  it('treats genuine read verbs as read-only', () => {
    for (const name of ['read_file', 'list_directory', 'get_weather', 'search_web', 'query_db']) {
      expect(isReadOnlyTool(name)).toBe(true);
    }
  });

  it('treats mutating tools that merely CONTAIN a read verb as NOT read-only', () => {
    // The old substring match misclassified these as parallel-safe.
    for (const name of ['budget_transfer', 'create_playlist', 'delete_query', 'reset_getters']) {
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

  it('bounds accumulated tool-argument JSON per call', async () => {
    const huge = 'x'.repeat(TOOL_LOOP_STREAM_LIMITS.maxToolArgsJsonChars + 50_000);
    // Split the oversized args across many fragments to exercise the running cap.
    const chunks: unknown[] = [toolCallChunk(0, 'id-0', 'get_a', '')];
    for (let i = 0; i < huge.length; i += 10_000) {
      chunks.push(toolCallChunk(0, 'id-0', 'get_a', huge.slice(i, i + 10_000)));
    }
    const { pendingToolCalls } = await collectProviderStream(sseStream(chunks));
    // Args parse fails on the truncated JSON and falls back to a bounded _raw.
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
    // 5 tool results of 1000 chars each = 5000; budget 2500, keep the newest 2.
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
    // No message removed → every assistant tool_call keeps its matching result.
    expect(msgs.length).toBe(lenBefore);
    // The two most-recent results are untouched.
    expect(msgs.find((m) => m.tool_call_id === 't4')!.content).toBe('x'.repeat(1000));
    expect(msgs.find((m) => m.tool_call_id === 't5')!.content).toBe('x'.repeat(1000));
    // The oldest was truncated to the marker.
    expect(msgs.find((m) => m.tool_call_id === 't1')!.content).toContain('omitted');
    // System + user messages are never touched.
    expect(msgs[0]).toBe(sys);
    expect(msgs[1]).toBe(user);
    // Retained tool content is now within budget.
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
    expect(msgs[2]!.content).toBe(parts); // untouched structured content
  });
});
