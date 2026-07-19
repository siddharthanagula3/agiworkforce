/**
 * Hardening unit tests for tool-loop internals: read-only classification
 * (parallel-safety) and untrusted-provider-stream accumulation bounds.
 */
import { describe, it, expect } from 'vitest';
import { isReadOnlyTool, collectProviderStream, TOOL_LOOP_STREAM_LIMITS } from './tool-loop';

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
