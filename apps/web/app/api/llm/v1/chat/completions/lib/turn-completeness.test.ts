import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { classifyEmptyTurn, isEmptyTurnOutput, isTurnTruncated } from './turn-completeness';

describe('what counts as a turn with nothing in it', () => {
  it('counts no text, no tool call and no artifact as nothing', () => {
    expect(isEmptyTurnOutput({ text: '   ' })).toBe(true);
  });

  it('counts a tool call on its own as something the reader watched happen', () => {
    expect(isEmptyTurnOutput({ text: '', toolCalls: 1 })).toBe(false);
  });

  it('counts a generated file on its own as something to keep', () => {
    expect(isEmptyTurnOutput({ text: '', generatedFiles: 1 })).toBe(false);
  });

  it('counts an interactive card on its own as something to keep', () => {
    expect(isEmptyTurnOutput({ text: '', interactiveCards: 1 })).toBe(false);
  });

  it('counts an answer as an answer', () => {
    expect(isEmptyTurnOutput({ text: 'Here it is.' })).toBe(false);
  });
});

describe('what counts as a turn that did not finish', () => {
  it('treats a reported failure as unfinished however the turn closed', () => {
    expect(
      isTurnTruncated({ reportedFailure: true, finishReason: 'stop', emptyOutput: false }),
    ).toBe(true);
  });

  it('treats a stream with no terminal signal as unfinished', () => {
    expect(
      isTurnTruncated({ reportedFailure: false, finishReason: null, emptyOutput: false }),
    ).toBe(true);
  });

  it('treats a turn that delivered nothing as unfinished, however cleanly it stopped', () => {
    expect(
      isTurnTruncated({ reportedFailure: false, finishReason: 'stop', emptyOutput: true }),
    ).toBe(true);
  });

  it('treats a cancelled turn as unfinished', () => {
    expect(
      isTurnTruncated({ reportedFailure: false, finishReason: 'cancelled', emptyOutput: false }),
    ).toBe(true);
  });

  it('leaves an answered turn alone', () => {
    expect(
      isTurnTruncated({ reportedFailure: false, finishReason: 'stop', emptyOutput: false }),
    ).toBe(false);
  });

  it('leaves a turn that handed back tool calls alone', () => {
    expect(
      isTurnTruncated({ reportedFailure: false, finishReason: 'tool_calls', emptyOutput: false }),
    ).toBe(false);
  });
});

describe('why a turn came back with nothing', () => {
  it('names the output limit when the model ran out of room', () => {
    expect(classifyEmptyTurn({ finishReason: 'length' })).toMatchObject({
      category: 'max_output',
    });
  });

  it('says the budget went on reasoning when that is what happened', () => {
    const classified = classifyEmptyTurn({ finishReason: 'length', reasoningReceived: true });
    expect(classified.category).toBe('max_output');
    expect(classified.message).toContain('reasoning');
  });

  it('names a safety stop as a block, not as silence', () => {
    expect(classifyEmptyTurn({ finishReason: 'content_filter' })).toMatchObject({
      category: 'content_blocked',
    });
  });

  it('names a stream with no terminal signal as a transport failure worth retrying', () => {
    expect(classifyEmptyTurn({ finishReason: null })).toMatchObject({
      category: 'connection',
      retryable: true,
    });
  });

  it('keeps the classification the stream already reported', () => {
    expect(
      classifyEmptyTurn({
        finishReason: 'stop',
        providerError: { message: 'too many requests', code: '429' },
      }),
    ).toMatchObject({ category: 'rate_limit' });
  });

  it('falls back to an empty response only when nothing else explains it', () => {
    expect(classifyEmptyTurn({ finishReason: 'stop' })).toMatchObject({
      category: 'empty_response',
    });
  });
});
