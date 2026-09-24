import { describe, expect, it } from 'vitest';
import { validatePromotionalChatStream } from './promotional-chat-stream';

const encoder = new TextEncoder();

function stream(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function output(...chunks: string[]): Promise<string> {
  return new Response(validatePromotionalChatStream(stream(...chunks))).text();
}

describe('promotional free chat stream validation', () => {
  it('preserves a fragmented answer and its terminal frame', async () => {
    const result = await output(
      'data: {"choices":[{"delta":{"content":"Hel',
      'lo"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    );
    expect(result).toContain('"content":"Hello"');
    expect(result).toContain('data: [DONE]');
    expect(result).not.toContain('x_stream_error');
  });

  it.each([
    ['no chunks', 'data: [DONE]\n\n'],
    ['only spaces', 'data: {"choices":[{"delta":{"content":"   "}}]}\n\ndata: [DONE]\n\n'],
  ])('turns %s into an actionable empty-response error', async (_label, source) => {
    const result = await output(source);
    expect(result).toContain('free_model_empty_response');
    expect(result).toContain('choose another free model');
    expect(result.match(/data: \[DONE\]/g)).toHaveLength(1);
  });

  it('replaces a raw provider error without leaking its message', async () => {
    const result = await output(
      'data: {"error":{"code":"quota_internal","message":"secret upstream diagnostic"}}\n\n',
    );
    expect(result).toContain('free_model_stream_failed');
    expect(result).not.toContain('secret upstream diagnostic');
    expect(result).toContain('data: [DONE]');
  });

  it('fails a truncated stream instead of accepting a partial answer as complete', async () => {
    const result = await output('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n');
    expect(result).toContain('"content":"Partial"');
    expect(result).toContain('free_model_stream_interrupted');
    expect(result).toContain('data: [DONE]');
  });

  it.each([
    ['length', 'free_model_output_limit'],
    ['content_filter', 'free_model_content_filtered'],
  ])('reports an incomplete %s finish instead of a completed answer', async (finish, code) => {
    const result = await output(
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Partial' }, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`,
    );
    expect(result).toContain('"content":"Partial"');
    expect(result).toContain(code);
    expect(result.match(/data: \[DONE\]/g)).toHaveLength(1);
  });

  it('does not forward a promotional model tool call into the client', async () => {
    const result = await output(
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","function":{"name":"web_search","arguments":"{}"}}]},"finish_reason":null}]}\n\ndata: [DONE]\n\n',
    );
    expect(result).toContain('free_model_tool_call_unsupported');
    expect(result).not.toContain('"tool_calls"');
    expect(result).not.toContain('"web_search"');
  });

  it('fails malformed and oversized frames without returning their raw data', async () => {
    const malformed = await output('data: {"choices":\n\ndata: [DONE]\n\n');
    expect(malformed).toContain('free_model_stream_invalid');
    expect(malformed).not.toContain('data: {"choices":\n');

    const oversized = await output(`data: ${'x'.repeat(300_000)}`);
    expect(oversized).toContain('free_model_stream_invalid');
    expect(oversized).not.toContain('x'.repeat(1_000));
  });

  it('preserves server-generated Qwen errors but never trusts upstream error frames', async () => {
    const frame =
      'data: {"choices":[{"delta":{"x_stream_error":{"message":"Safe route copy","code":"free_quota_exhausted"}}}]}\n\ndata: [DONE]\n\n';
    const trusted = await new Response(
      validatePromotionalChatStream(stream(frame), { trustedErrorFrames: true }),
    ).text();
    expect(trusted).toContain('Safe route copy');
    expect(trusted).not.toContain('free_model_empty_response');

    const untrusted = await output(frame);
    expect(untrusted).not.toContain('Safe route copy');
    expect(untrusted).toContain('free_model_stream_failed');
  });
});
