import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import { resolveTurnErrorNotice } from './turn-error-notice';

const REPORTED = 'Could not start the conversation.';

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: '',
    createdAt: '2026-09-07T22:43:00.000Z',
    ...overrides,
  } as unknown as ChatMessage;
}

function resolve(overrides: Partial<Parameters<typeof resolveTurnErrorNotice>[0]> = {}) {
  return resolveTurnErrorNotice({
    lastMessage: message({ role: 'user', content: 'hi' }),
    isLoading: false,
    reportedTurnError: null,
    pastGracePeriod: true,
    ...overrides,
  });
}

describe('resolveTurnErrorNotice', () => {
  it('states the reported send failure as soon as the turn fails', () => {
    expect(resolve({ reportedTurnError: REPORTED, pastGracePeriod: false })).toBe(REPORTED);
  });

  it('stays quiet while a fresh turn is still within the grace period', () => {
    expect(resolve({ pastGracePeriod: false })).toBeNull();
  });

  it('falls back to the empty-response copy once the grace period lapses', () => {
    expect(resolve()).toMatch(/returned no response for this turn/i);
  });

  it('stays quiet while the turn is still running', () => {
    expect(resolve({ isLoading: true, reportedTurnError: REPORTED })).toBeNull();
    expect(
      resolve({
        lastMessage: message({ isStreaming: true }),
        reportedTurnError: REPORTED,
      }),
    ).toBeNull();
  });

  it('leaves a user Stop to its own notice', () => {
    expect(
      resolve({
        lastMessage: message({ metadata: { finishReason: 'stopped' } }),
        reportedTurnError: REPORTED,
      }),
    ).toBeNull();
  });

  it('leaves a safety refusal to its own notice', () => {
    expect(
      resolve({
        lastMessage: message({ content: 'Partial.', metadata: { finishReason: 'refusal' } }),
        reportedTurnError: REPORTED,
      }),
    ).toBeNull();
  });

  it('leaves a mid-stream provider failure to its own notice', () => {
    expect(
      resolve({
        lastMessage: message({
          content: 'Partial.',
          metadata: { streamError: { message: 'upstream dropped' } },
        }),
        reportedTurnError: REPORTED,
      }),
    ).toBeNull();
  });

  it('says nothing for a turn that completed', () => {
    expect(resolve({ lastMessage: message({ content: 'Here is the answer.' }) })).toBeNull();
  });
});
