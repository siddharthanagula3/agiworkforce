import { describe, expect, it } from 'vitest';
import {
  isContinuableFinishReason,
  isMessageContinuable,
  hasStreamError,
  getStreamErrorMessage,
  CONTINUE_GENERATION_INSTRUCTION,
} from '../continue-generation';

function assistantMessage(overrides: Record<string, unknown> = {}) {
  return {
    role: 'assistant',
    content: 'partial answer that got cut off',
    isStreaming: false,
    ...overrides,
  };
}

describe('isContinuableFinishReason', () => {
  it('accepts token-cap truncation reasons from both wire shapes', () => {
    expect(isContinuableFinishReason('length')).toBe(true);
    expect(isContinuableFinishReason('max_tokens')).toBe(true);
  });

  it('accepts the client-only user-stopped marker', () => {
    expect(isContinuableFinishReason('stopped')).toBe(true);
  });

  it('accepts a provider-paused turn, which is suspended rather than finished', () => {
    expect(isContinuableFinishReason('pause_turn')).toBe(true);
  });

  it('rejects normal completion and every other reason', () => {
    expect(isContinuableFinishReason('stop')).toBe(false);
    expect(isContinuableFinishReason('end_turn')).toBe(false);
    expect(isContinuableFinishReason('tool_calls')).toBe(false);
    expect(isContinuableFinishReason('content_filter')).toBe(false);
    expect(isContinuableFinishReason(undefined)).toBe(false);
    expect(isContinuableFinishReason(null)).toBe(false);
    expect(isContinuableFinishReason(42)).toBe(false);
  });
});

describe('isMessageContinuable', () => {
  it('offers Continue on a token-cap-truncated assistant turn', () => {
    expect(isMessageContinuable(assistantMessage({ metadata: { finishReason: 'length' } }))).toBe(
      true,
    );
    expect(
      isMessageContinuable(assistantMessage({ metadata: { finishReason: 'max_tokens' } })),
    ).toBe(true);
  });

  it('offers Continue on a user-stopped turn with partial content', () => {
    expect(isMessageContinuable(assistantMessage({ metadata: { finishReason: 'stopped' } }))).toBe(
      true,
    );
  });

  it('does NOT offer Continue on a normally-completed turn', () => {
    // The shared fixture's content is "partial answer that got cut off", which
    // is exactly what a truncation check should flag - so a turn that is
    // genuinely finished needs a finished answer to stand on.
    const finished = { content: 'That covers everything you asked about.' };
    expect(
      isMessageContinuable(assistantMessage({ ...finished, metadata: { finishReason: 'stop' } })),
    ).toBe(false);
    expect(isMessageContinuable(assistantMessage({ ...finished, metadata: {} }))).toBe(false);
    expect(isMessageContinuable(assistantMessage({ ...finished, metadata: undefined }))).toBe(
      false,
    );
  });

  it('offers Continue when a stop-finished answer still reads as cut off', () => {
    // A provider can end a turn mid-sentence and report finish_reason stop.
    expect(isMessageContinuable(assistantMessage({ metadata: { finishReason: 'stop' } }))).toBe(
      true,
    );
  });

  it('does NOT offer Continue when the partial content is empty', () => {
    expect(
      isMessageContinuable(
        assistantMessage({ content: '', metadata: { finishReason: 'stopped' } }),
      ),
    ).toBe(false);
    expect(
      isMessageContinuable(
        assistantMessage({ content: '   \n ', metadata: { finishReason: 'length' } }),
      ),
    ).toBe(false);
  });

  it('does NOT offer Continue while streaming, on errored turns, or on non-assistant roles', () => {
    expect(
      isMessageContinuable(
        assistantMessage({ isStreaming: true, metadata: { finishReason: 'length' } }),
      ),
    ).toBe(false);
    expect(
      isMessageContinuable(
        assistantMessage({ error: 'boom', metadata: { finishReason: 'stopped' } }),
      ),
    ).toBe(false);
    expect(
      isMessageContinuable(
        assistantMessage({ role: 'user', metadata: { finishReason: 'length' } }),
      ),
    ).toBe(false);
    expect(isMessageContinuable(undefined)).toBe(false);
    expect(isMessageContinuable(null)).toBe(false);
  });
});

describe('hasStreamError', () => {
  it('is true when metadata.streamError carries a non-empty message (object shape)', () => {
    expect(
      hasStreamError({
        metadata: { streamError: { message: 'Anthropic API overloaded', retryable: true } },
      }),
    ).toBe(true);
  });

  it('is true for a bare string streamError too (defensive, not the primary shape)', () => {
    expect(hasStreamError({ metadata: { streamError: 'Anthropic API overloaded' } })).toBe(true);
  });

  it('is false when streamError is absent, empty, or the wrong type', () => {
    expect(hasStreamError({ metadata: {} })).toBe(false);
    expect(hasStreamError({ metadata: { streamError: '' } })).toBe(false);
    expect(hasStreamError({ metadata: { streamError: { message: '' } } })).toBe(false);
    expect(hasStreamError({ metadata: { streamError: undefined } })).toBe(false);
    expect(hasStreamError({ metadata: { streamError: 42 } })).toBe(false);
    expect(hasStreamError({ metadata: undefined })).toBe(false);
    expect(hasStreamError({})).toBe(false);
    expect(hasStreamError(undefined)).toBe(false);
    expect(hasStreamError(null)).toBe(false);
  });

  it("is true retroactively when metadata.finishReason==='error', even with no marker at all", () => {
    expect(hasStreamError({ metadata: { finishReason: 'error' } })).toBe(true);
  });

  it('does NOT treat any other finishReason as a stream error', () => {
    expect(hasStreamError({ metadata: { finishReason: 'stop' } })).toBe(false);
    expect(hasStreamError({ metadata: { finishReason: 'length' } })).toBe(false);
    expect(hasStreamError({ metadata: { finishReason: 'stopped' } })).toBe(false);
  });

  it('does not require an assistant role or non-streaming state on its own (callers gate that)', () => {
    const userMessage: Record<string, unknown> = assistantMessage({
      role: 'user',
      metadata: { streamError: { message: 'boom' } },
    });
    expect(hasStreamError(userMessage)).toBe(true);
  });
});

describe('getStreamErrorMessage', () => {
  it('reads .message off the object-shaped marker', () => {
    expect(getStreamErrorMessage({ metadata: { streamError: { message: 'rate limited' } } })).toBe(
      'rate limited',
    );
  });

  it('reads a bare string marker too', () => {
    expect(getStreamErrorMessage({ metadata: { streamError: 'rate limited' } })).toBe(
      'rate limited',
    );
  });

  it('returns undefined for the retroactive finishReason-only case (no classified message survived)', () => {
    expect(getStreamErrorMessage({ metadata: { finishReason: 'error' } })).toBeUndefined();
  });

  it('returns undefined when there is no error signal at all', () => {
    expect(getStreamErrorMessage({ metadata: {} })).toBeUndefined();
    expect(getStreamErrorMessage(undefined)).toBeUndefined();
    expect(getStreamErrorMessage(null)).toBeUndefined();
  });
});

describe('CONTINUE_GENERATION_INSTRUCTION', () => {
  it('asks for a seamless in-place continuation, not a restart', () => {
    expect(CONTINUE_GENERATION_INSTRUCTION).toMatch(/continue/i);
    expect(CONTINUE_GENERATION_INSTRUCTION).toMatch(/do not repeat/i);
  });
});
