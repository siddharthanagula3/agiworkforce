import { describe, expect, it, vi } from 'vitest';
import {
  readServerSentEvents,
  ServerSentEventDecoder,
  ServerSentEventFrameLimitError,
} from '../sse';

function decodeInChunks(chunks: string[], limit: number) {
  const decoder = new ServerSentEventDecoder(limit);
  const events = chunks.flatMap((chunk) => decoder.push(chunk));
  return [...events, ...decoder.finish().events].map((event) => event.data);
}

function everySplit(stream: string): string[][] {
  const splits: string[][] = [[stream]];
  for (let first = 1; first < stream.length; first += 1) {
    splits.push([stream.slice(0, first), stream.slice(first)]);
    for (let second = first + 1; second < stream.length; second += 1) {
      splits.push([stream.slice(0, first), stream.slice(first, second), stream.slice(second)]);
    }
  }
  splits.push(stream.split(''));
  return splits;
}

describe('ServerSentEventDecoder frame limit', () => {
  const frames = 'data: a\n\ndata: b\n\ndata: c\n\n';

  it('accepts several individually valid frames delivered in one read', () => {
    expect(decodeInChunks([frames], 12)).toEqual(['a', 'b', 'c']);
  });

  it('accepts the same frames under every transport split', () => {
    for (const chunks of everySplit(frames)) {
      expect(decodeInChunks(chunks, 12)).toEqual(['a', 'b', 'c']);
    }
  });

  it('accepts several real-limit frames whose sum exceeds one frame', () => {
    const payload = 'x'.repeat(400_000);
    const stream = Array.from({ length: 5 }, () => `data: ${payload}\n\n`).join('');
    expect(decodeInChunks([stream], 1_048_576)).toHaveLength(5);
  });

  it('rejects an oversized frame under every transport split', () => {
    const oversized = `data: ${'x'.repeat(13)}\n\ndata: a\n\n`;
    for (const chunks of everySplit(oversized)) {
      expect(() => decodeInChunks(chunks, 12)).toThrow(ServerSentEventFrameLimitError);
    }
  });

  it('rejects a multi-line frame whose joined data exceeds the limit', () => {
    expect(() => decodeInChunks(['data: aaaaaa\ndata: bbbbbb\n\n'], 12)).toThrow(
      ServerSentEventFrameLimitError,
    );
  });

  it('rejects an unterminated line that grows past the limit', () => {
    const decoder = new ServerSentEventDecoder(12);
    decoder.push('data: aaaa');
    expect(() => decoder.push('aaaaaaaaa')).toThrow(ServerSentEventFrameLimitError);
  });

  it('rejects an oversized non-data field', () => {
    expect(() => decodeInChunks([`event: ${'e'.repeat(20)}\ndata: a\n\n`], 12)).toThrow(
      ServerSentEventFrameLimitError,
    );
  });
});

describe('readServerSentEvents body ownership', () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  function openBody(text: string, cancel: () => void | Promise<void> = vi.fn()) {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes(text));
      },
      cancel,
    });
    return { body, cancel };
  }

  it('cancels and unlocks when the consumer stops before EOF', async () => {
    const { body, cancel } = openBody('data: first\n\ndata: unread\n\n');
    for await (const event of readServerSentEvents(body)) {
      expect(event.data).toBe('first');
      break;
    }
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('preserves callback failure while cancelling unread bytes', async () => {
    const { body, cancel } = openBody('data: first\n\n');
    const failure = new Error('retired account');
    const iterator = readServerSentEvents(body, {
      onChunk: () => {
        throw failure;
      },
    });
    await expect(iterator.next()).rejects.toBe(failure);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('cancels on frame-limit failure', async () => {
    const { body, cancel } = openBody('data: too long\n\n');
    const iterator = readServerSentEvents(body, { maximumFrameCharacters: 4 });
    await expect(iterator.next()).rejects.toBeInstanceOf(ServerSentEventFrameLimitError);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('preserves read failure and releases an errored body', async () => {
    const failure = new Error('transport failed');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(failure);
      },
    });
    await expect(readServerSentEvents(body).next()).rejects.toBe(failure);
    expect(body.locked).toBe(false);
  });

  it('flushes an accepted final frame at EOF without cancelling', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes('data: tail'));
        controller.close();
      },
      cancel,
    });
    const events = [];
    for await (const event of readServerSentEvents(body, { acceptUnterminatedFinalFrame: true })) {
      events.push(event.data);
    }
    expect(events).toEqual(['tail']);
    expect(cancel).not.toHaveBeenCalled();
    expect(body.locked).toBe(false);
  });

  it('does not replace the original failure when cancellation rejects', async () => {
    const cancel = vi.fn(() => Promise.reject(new Error('cancel failed')));
    const { body } = openBody('data: first\n\n', cancel);
    const failure = new Error('callback failed');
    await expect(
      readServerSentEvents(body, {
        onChunk: () => {
          throw failure;
        },
      }).next(),
    ).rejects.toBe(failure);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('does not wait for a source that never finishes cancellation', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const { body } = openBody('data: first\n\n', cancel);
    const iterator = readServerSentEvents(body);
    await expect(iterator.next()).resolves.toMatchObject({ value: { data: 'first' }, done: false });
    await expect(iterator.return(undefined)).resolves.toMatchObject({ done: true });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });
});

describe('readServerSentEvents abort', () => {
  it('ends a read that never settles once its signal aborts, and cancels the body', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"partial":true}\n\n'));
      },
      cancel,
    });
    const controller = new AbortController();
    const iterator = readServerSentEvents(body, { signal: controller.signal });

    await expect(iterator.next()).resolves.toMatchObject({
      value: { data: '{"partial":true}' },
    });
    const pending = iterator.next();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('refuses to read at all when the signal has already aborted', async () => {
    const body = new ReadableStream<Uint8Array>({ start() {} });
    const controller = new AbortController();
    controller.abort();

    await expect(
      readServerSentEvents(body, { signal: controller.signal }).next(),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
