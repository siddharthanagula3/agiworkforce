import { describe, expect, it } from 'vitest';
import {
  BoundedSseDecoder,
  SseFrameLimitError,
} from '../src/features/cloud-bridge/boundedSseDecoder';

describe('BoundedSseDecoder', () => {
  it('applies the limit to each pending event rather than the entire network read', () => {
    const decoder = new BoundedSseDecoder(12);

    expect(decoder.push('data: a\n\ndata: b\n\n')).toEqual(['a', 'b']);
    expect(decoder.finish()).toEqual({ events: [], incomplete: false });
  });

  it('rejects a single unterminated event that exceeds the configured limit', () => {
    const decoder = new BoundedSseDecoder(8);

    expect(() => decoder.push('data: abcdefghi')).toThrow(SseFrameLimitError);
  });

  it('preserves a CR split from a following LF across network reads', () => {
    const decoder = new BoundedSseDecoder(64);

    expect(decoder.push('data: hello\r')).toEqual([]);
    expect(decoder.push('\n\r\n')).toEqual(['hello']);
    expect(decoder.finish()).toEqual({ events: [], incomplete: false });
  });
});
