import { describe, expect, it } from 'vitest';
import { getProviderProxyUsageParser } from './provider-proxy-usage';

const parser = getProviderProxyUsageParser('anthropic');
if (!parser) throw new Error('anthropic provider-proxy usage parser is not registered');

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe('provider-proxy usage parser', () => {
  it('has no parser registered for an unsupported provider', () => {
    expect(getProviderProxyUsageParser('openai')).toBeNull();
  });

  describe('anthropic non-streaming bodies', () => {
    it('extracts usage and model from a completed message', () => {
      expect(
        parser.parseJsonBody({
          model: 'test-anthropic-model',
          usage: {
            input_tokens: 120,
            output_tokens: 45,
            cache_read_input_tokens: 10,
            cache_creation_input_tokens: 5,
            cache_creation: { ephemeral_1h_input_tokens: 3 },
          },
        }),
      ).toEqual({
        model: 'test-anthropic-model',
        inputTokens: 120,
        outputTokens: 45,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        cacheWrite1hTokens: 3,
      });
    });

    it('defaults missing cache fields to zero', () => {
      expect(
        parser.parseJsonBody({
          model: 'test-anthropic-model',
          usage: { input_tokens: 8, output_tokens: 2 },
        }),
      ).toEqual({
        model: 'test-anthropic-model',
        inputTokens: 8,
        outputTokens: 2,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheWrite1hTokens: 0,
      });
    });

    it('returns null when the body has no usage', () => {
      expect(parser.parseJsonBody({ model: 'test-anthropic-model' })).toBeNull();
      expect(parser.parseJsonBody(null)).toBeNull();
      expect(parser.parseJsonBody('not an object')).toBeNull();
    });
  });

  describe('anthropic streaming bodies', () => {
    it('combines message_start input/cache usage with message_delta output usage', () => {
      const accumulator = parser.createStreamAccumulator();
      accumulator.push(
        sseFrame('message_start', {
          type: 'message_start',
          message: {
            model: 'test-anthropic-model',
            usage: {
              input_tokens: 200,
              cache_read_input_tokens: 50,
              cache_creation_input_tokens: 20,
              cache_creation: { ephemeral_1h_input_tokens: 7 },
            },
          },
        }),
      );
      accumulator.push(
        sseFrame('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'hi' },
        }),
      );
      accumulator.push(
        sseFrame('message_delta', {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 33 },
        }),
      );

      expect(accumulator.finish()).toEqual({
        model: 'test-anthropic-model',
        inputTokens: 200,
        outputTokens: 33,
        cacheReadTokens: 50,
        cacheWriteTokens: 20,
        cacheWrite1hTokens: 7,
      });
    });

    it('handles a frame split across multiple push() calls', () => {
      const accumulator = parser.createStreamAccumulator();
      const frame = sseFrame('message_start', {
        type: 'message_start',
        message: { model: 'test-anthropic-model', usage: { input_tokens: 9 } },
      });
      accumulator.push(frame.slice(0, 10));
      accumulator.push(frame.slice(10));
      accumulator.push(
        sseFrame('message_delta', {
          type: 'message_delta',
          usage: { output_tokens: 4 },
        }),
      );

      expect(accumulator.finish()).toEqual({
        model: 'test-anthropic-model',
        inputTokens: 9,
        outputTokens: 4,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheWrite1hTokens: 0,
      });
    });

    it('parses a final unterminated frame at finish()', () => {
      const accumulator = parser.createStreamAccumulator();
      const frame = sseFrame('message_start', {
        type: 'message_start',
        message: { model: 'test-anthropic-model', usage: { input_tokens: 6, output_tokens: 0 } },
      });
      // No trailing blank line: the last frame in a real stream is not
      // always followed by another event before the connection closes.
      accumulator.push(frame.trimEnd());

      expect(accumulator.finish()).toEqual({
        model: 'test-anthropic-model',
        inputTokens: 6,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheWrite1hTokens: 0,
      });
    });

    it('returns null when no usage-bearing event was seen', () => {
      const accumulator = parser.createStreamAccumulator();
      accumulator.push(
        sseFrame('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'hi' },
        }),
      );
      accumulator.push('event: ping\ndata: not json\n\n');
      expect(accumulator.finish()).toBeNull();
    });
  });
});
