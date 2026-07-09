import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withSseHeartbeat } from './sse-heartbeat';

vi.mock('server-only', () => ({}));

function makeSource(): {
  stream: ReadableStream<Uint8Array>;
  push: (text: string) => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  return {
    stream,
    push: (text: string) => controllerRef.enqueue(encoder.encode(text)),
    close: () => controllerRef.close(),
  };
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) out += decoder.decode(value, { stream: true });
  }
  return out;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('withSseHeartbeat', () => {
  it('passes real data through unchanged when the source never goes idle', async () => {
    const source = makeSource();
    const wrapped = withSseHeartbeat(source.stream, 15_000);
    const reader = wrapped.getReader();

    source.push('data: {"a":1}\n\n');
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe('data: {"a":1}\n\n');

    source.close();
    const second = await reader.read();
    expect(second.done).toBe(true);
  });

  it('emits ": keepalive" after intervalMs of silence, and stops after close', async () => {
    const source = makeSource();
    const wrapped = withSseHeartbeat(source.stream, 15_000);
    const chunks: string[] = [];
    const decoder = new TextDecoder();

    const readLoop = (async () => {
      const reader = wrapped.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) chunks.push(decoder.decode(value, { stream: true }));
      }
    })();

    source.push('data: {"a":1}\n\n');
    await vi.advanceTimersByTimeAsync(0);
    expect(chunks).toEqual(['data: {"a":1}\n\n']);

    // 15s of silence -> exactly one heartbeat, not a flood of them.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(chunks).toEqual(['data: {"a":1}\n\n', ': keepalive\n\n']);

    // Real data arrives -> resets the idle clock; no heartbeat at the old
    // 15s mark relative to the FIRST heartbeat (i.e. at +5s more, total
    // elapsed since the last heartbeat is only 5s, well under the interval).
    source.push('data: {"b":2}\n\n');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(chunks).toEqual(['data: {"a":1}\n\n', ': keepalive\n\n', 'data: {"b":2}\n\n']);

    source.close();
    await readLoop;

    // No further heartbeats fire once the stream has closed, even if more
    // wall-clock time passes (the interval is cleared on close).
    await vi.advanceTimersByTimeAsync(30_000);
    expect(chunks).toEqual(['data: {"a":1}\n\n', ': keepalive\n\n', 'data: {"b":2}\n\n']);
  });

  it('propagates upstream close (no heartbeats needed) for a short, fast stream', async () => {
    const source = makeSource();
    const wrapped = withSseHeartbeat(source.stream, 15_000);
    source.push('data: {"x":1}\n\n');
    source.close();

    const text = await readAll(wrapped);
    expect(text).toBe('data: {"x":1}\n\n');
  });

  it('cancels the underlying reader and clears the timer when the consumer cancels', async () => {
    const source = makeSource();
    const wrapped = withSseHeartbeat(source.stream, 15_000);
    const reader = wrapped.getReader();
    await reader.cancel('client disconnected');

    // If the interval weren't cleared, this would eventually throw trying
    // to enqueue on a released controller -- an unhandled rejection here
    // (not caught by this await) is the regression signal.
    await vi.advanceTimersByTimeAsync(60_000);
  });
});
