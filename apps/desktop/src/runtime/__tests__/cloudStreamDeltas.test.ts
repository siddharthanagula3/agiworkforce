/**
 * cloudStreamDeltas unit tests — mock-only, no live backend.
 *
 * cloudStreamDeltas.ts previously had NO dedicated test file at all (only
 * WebRuntime.test.ts's x_generated_files case exercised it indirectly), which
 * is exactly why `x_code_result`/`x_research_status` could go unhandled for a
 * whole delta-type's worth of silent data loss without any test catching it
 * (see the module's own history: WebRuntime used to hand-roll parsing inline
 * and CloudRuntime implemented none of it before this sink existed).
 *
 * The `every x_* delta key the wire can emit` describe block below is the
 * pattern-guard for that whole class: the key list is sourced from a live
 * grep of apps/web/app/api/llm/v1/chat/completions/lib/*.ts (excluding
 * response-only fields like `x_agi_workforce`, which lives on the aggregated
 * non-streaming response object, never on a per-chunk `delta`) — if the
 * server starts emitting a new `x_*` delta key this list doesn't know about,
 * add it here AND to the sink, in the same change.
 */
import { describe, it, expect } from 'vitest';
import type { StreamEvent } from '@agiworkforce/unified-chat';
import { createCloudStreamDeltaSink } from '../cloudStreamDeltas';

function makeSink() {
  const events: StreamEvent[] = [];
  const sink = createCloudStreamDeltaSink((event) => events.push(event), 'https://cloud.example');
  return { sink, events };
}

/** Wrap a `delta` object in the OpenAI-wire `{choices: [{delta}]}` envelope the sink reads. */
function payload(delta: Record<string, unknown>): Record<string, unknown> {
  return { choices: [{ delta, index: 0 }], model: 'claude-x' };
}

describe('cloudStreamDeltas — every x_* delta key the wire can emit', () => {
  it('x_search_results: emits a search_results event, not silently dropped', () => {
    const { sink, events } = makeSink();
    sink.onEvent(
      payload({
        x_search_results: {
          content: [{ type: 'web_search_result', url: 'https://a.com', title: 'A' }],
        },
      }),
    );
    expect(events.some((e) => e.type === 'search_results')).toBe(true);
  });

  it('x_code_result: emits a code_execution_result event AND resolves the code_execution tool card', () => {
    const { sink, events } = makeSink();
    // First open the card the way the server actually does (x_tool_status
    // 'executing'), then close it — mirrors the real wire sequence.
    sink.onEvent(
      payload({
        x_tool_status: { type: 'server_tool_use', name: 'code_execution', status: 'executing' },
      }),
    );
    sink.onEvent(
      payload({
        x_code_result: {
          content: [{ type: 'text', text: '<stdout>42\n</stdout><return_code>0</return_code>' }],
        },
      }),
    );
    const resultEvent = events.find((e) => e.type === 'code_execution_result');
    expect(resultEvent).toBeDefined();
    expect(resultEvent).toMatchObject({
      type: 'code_execution_result',
      result: { stdout: '42\n', returnCode: 0 },
    });
    // The card opened by x_tool_status must be resolved, not left spinning.
    const toolResult = events.find(
      (e) => e.type === 'tool_result' && e.toolCallId === 'status:code_execution',
    );
    expect(toolResult).toBeDefined();
  });

  it('x_research_status: emits a research_status event, not silently dropped', () => {
    const { sink, events } = makeSink();
    sink.onEvent(payload({ x_research_status: { phase: 'searching', searches: 2 } }));
    const statusEvent = events.find((e) => e.type === 'research_status');
    expect(statusEvent).toBeDefined();
    expect(statusEvent).toMatchObject({ type: 'research_status', status: { phase: 'searching' } });
  });

  it('x_stream_error: captured as {message,code,retryable} via getStreamError(), not silently dropped', () => {
    const { sink } = makeSink();
    sink.onEvent(
      payload({
        x_stream_error: { message: 'Anthropic API overloaded', code: '529', retryable: true },
      }),
    );
    expect(sink.getStreamError()).toEqual({
      message: 'Anthropic API overloaded',
      code: '529',
      retryable: true,
    });
  });

  it('x_stream_error: accepts a bare string defensively (wraps it as {message})', () => {
    const { sink } = makeSink();
    sink.onEvent(payload({ x_stream_error: 'rate limited' }));
    expect(sink.getStreamError()).toEqual({ message: 'rate limited' });
  });

  it('x_tool_approval_request: emits a tool_approval_request event and registers the pending call', () => {
    const { sink, events } = makeSink();
    sink.onEvent(
      payload({
        x_tool_approval_request: {
          tool_call_id: 'tc_1',
          name: 'gmail_send',
          args: { to: 'a@b.com' },
        },
      }),
    );
    expect(events.some((e) => e.type === 'tool_approval_request')).toBe(true);
    expect(sink.getPendingApprovalCalls()).toEqual([
      { toolCallId: 'tc_1', name: 'gmail_send', args: { to: 'a@b.com' } },
    ]);
    expect(sink.isSuspended()).toBe(true);
  });

  it('x_tool_result: emits a tool_result event, not silently dropped', () => {
    const { sink, events } = makeSink();
    sink.onEvent(
      payload({
        x_tool_result: {
          tool_call_id: 'tc_2',
          name: 'gmail_send',
          content: 'sent',
          is_error: false,
        },
      }),
    );
    const toolResult = events.find((e) => e.type === 'tool_result' && e.toolCallId === 'tc_2');
    expect(toolResult).toBeDefined();
  });

  it('x_tool_status: emits a tool_call event for a running MCP tool, not silently dropped', () => {
    const { sink, events } = makeSink();
    sink.onEvent(
      payload({ x_tool_status: { type: 'mcp_tool_use', name: 'gmail_send', status: 'running' } }),
    );
    expect(events.some((e) => e.type === 'tool_call')).toBe(true);
  });

  it('x_generated_files: emits a generated_files event, not silently dropped', () => {
    const { sink, events } = makeSink();
    sink.onEvent(
      payload({
        x_generated_files: {
          files: [
            {
              id: 'gf-1',
              file_name: 'report.pdf',
              mime_type: 'application/pdf',
              uri: '/api/files/gf-1',
              byte_count: 2048,
              kind: 'pdf',
            },
          ],
        },
      }),
    );
    expect(events.some((e) => e.type === 'generated_files')).toBe(true);
  });
});
