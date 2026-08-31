import { describe, expect, it } from 'vitest';
import {
  isContinuableFinishReason,
  isMessageContinuable,
  CONTINUE_GENERATION_INSTRUCTION,
} from './continue-generation';

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
    const finished = { content: 'Here is the whole answer, and it ends properly.' };
    expect(
      isMessageContinuable(assistantMessage({ ...finished, metadata: { finishReason: 'stop' } })),
    ).toBe(false);
    expect(isMessageContinuable(assistantMessage({ ...finished, metadata: {} }))).toBe(false);
    expect(isMessageContinuable(assistantMessage({ ...finished, metadata: undefined }))).toBe(
      false,
    );
  });

  it('offers Continue when the text reads as cut off however the turn was reported', () => {
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
        assistantMessage({ error: true, metadata: { finishReason: 'stopped' } }),
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

describe('CONTINUE_GENERATION_INSTRUCTION', () => {
  it('asks for a seamless in-place continuation, not a restart', () => {
    expect(CONTINUE_GENERATION_INSTRUCTION).toMatch(/continue/i);
    expect(CONTINUE_GENERATION_INSTRUCTION).toMatch(/do not repeat/i);
  });
});
