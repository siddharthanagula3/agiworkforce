import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());

vi.mock('@shared/lib/logger', () => ({
  logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: async () => null }));
vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: async (headers: HeadersInit) => headers }));
vi.mock('@/lib/client/browser-timezone', () => ({ getBrowserTimeZone: () => 'UTC' }));
vi.mock('@/lib/device-steps/host-headers', () => ({
  readChatHostContext: async () => ({ surface: 'web' }),
}));
vi.mock('@features/chat/lib/free-quota-selection', () => ({
  chatCompletionEndpoint: () => '/api/llm/v1/chat/completions',
}));

import { CompareAnswerError, streamCompareAnswer } from './compare-answer-stream';

const encoder = new TextEncoder();

function respondWith(...chunks: string[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status: 200 })),
  );
}

function textFrame(content: string, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: finishReason }] })}\n\n`;
}

async function run(): Promise<{ text: string; finishReason: string | null }> {
  let text = '';
  const outcome = await streamCompareAnswer('model', 'hi', new AbortController().signal, {
    onStart: () => undefined,
    onText: (chunk) => {
      text += chunk;
    },
  });
  return { text, ...outcome };
}

describe('streamCompareAnswer', () => {
  beforeEach(() => {
    warn.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a normal answer', async () => {
    respondWith(textFrame('Hel'), textFrame('lo', 'stop'), 'data: [DONE]\n\n');
    expect(await run()).toEqual({ text: 'Hello', finishReason: 'stop' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('skips and logs a frame that is not valid JSON while keeping the answer', async () => {
    respondWith(
      textFrame('Hel'),
      'data: {"choices":[{"delta"\n\n',
      textFrame('lo', 'stop'),
      'data: [DONE]\n\n',
    );
    expect(await run()).toEqual({ text: 'Hello', finishReason: 'stop' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('skips and logs a frame whose data is not an object', async () => {
    respondWith(
      textFrame('Hi'),
      'data: 42\n\n',
      'data: ["x"]\n\n',
      textFrame('!', 'stop'),
      'data: [DONE]\n\n',
    );
    expect((await run()).text).toBe('Hi!');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('fails with the unreadable message only when no text arrived', async () => {
    respondWith('data: not json\n\n', 'data: [DONE]\n\n');
    await expect(run()).rejects.toMatchObject({
      name: 'CompareAnswerError',
      message: 'This answer arrived in a form the page could not read. Try again.',
    });
  });

  it('fails with the unreadable message when the only frames are skipped and the stream ends', async () => {
    respondWith('data: not json\n\n', 'data: also not json\n\n');
    await expect(run()).rejects.toBeInstanceOf(CompareAnswerError);
  });

  it('still fails on an error frame after text has arrived', async () => {
    respondWith(textFrame('Hi'), 'data: {"error":{"message":"upstream failed"}}\n\n');
    await expect(run()).rejects.toMatchObject({ message: 'upstream failed' });
  });
});
