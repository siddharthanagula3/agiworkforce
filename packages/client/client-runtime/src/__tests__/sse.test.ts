import { describe, expect, it } from 'vitest';
import { ServerSentEventDecoder, ServerSentEventFrameLimitError } from '../sse';

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
