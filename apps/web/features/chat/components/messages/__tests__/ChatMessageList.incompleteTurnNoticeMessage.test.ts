import { describe, expect, it } from 'vitest';
import { INCOMPLETE_TURN_DEFAULT_MESSAGE, incompleteTurnNoticeMessage } from '../ChatMessageList';
import type { ChatMessage } from '@agiworkforce/unified-chat';

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content:
      'Error: something failed.\n\nTry again, or start a new chat if this response is stuck.',
    error: 'failed',
    ...overrides,
  };
}

describe('incompleteTurnNoticeMessage', () => {
  it('names the cause for a rate-limited turn', () => {
    const message = assistantMessage({ metadata: { errorCode: 'provider_rate_limited' } });
    expect(incompleteTurnNoticeMessage(message)).toMatch(/too many requests/i);
  });

  it('treats a spent quota window as the same rate-limit cause', () => {
    const message = assistantMessage({ metadata: { errorCode: 'provider_quota_exhausted' } });
    expect(incompleteTurnNoticeMessage(message)).toMatch(/too many requests/i);
  });

  it('names a provider outage distinctly from a rate limit', () => {
    const message = assistantMessage({ metadata: { errorCode: 'provider_unreachable' } });
    const text = incompleteTurnNoticeMessage(message);
    expect(text).toMatch(/temporarily unreachable/i);
    expect(text).not.toMatch(/too many requests/i);
  });

  it('names a deadline or timeout distinctly', () => {
    const message = assistantMessage({ metadata: { errorCode: 'provider_timeout' } });
    expect(incompleteTurnNoticeMessage(message)).toMatch(/took too long to respond/i);
  });

  it('names a capability or model restriction distinctly', () => {
    const message = assistantMessage({ metadata: { errorCode: 'context_length_exceeded' } });
    expect(incompleteTurnNoticeMessage(message)).toMatch(/could not complete this request/i);
  });

  it('treats a trailing user message with no reply as an empty response', () => {
    const message: ChatMessage = { id: 'user-1', role: 'user', content: 'hello' };
    expect(incompleteTurnNoticeMessage(message)).toMatch(/no response/i);
  });

  it('treats an empty truncated assistant row as an empty response', () => {
    const message = assistantMessage({
      content: '',
      metadata: { truncated: true },
    });
    expect(incompleteTurnNoticeMessage(message)).toMatch(/no response/i);
  });

  it('keeps the generic copy for an unclassified cause', () => {
    const message = assistantMessage({ metadata: {} });
    expect(incompleteTurnNoticeMessage(message)).toBe(INCOMPLETE_TURN_DEFAULT_MESSAGE);
  });

  it('keeps the generic copy for an unrecognized error code', () => {
    const message = assistantMessage({ metadata: { errorCode: 'something_new' } });
    expect(incompleteTurnNoticeMessage(message)).toBe(INCOMPLETE_TURN_DEFAULT_MESSAGE);
  });

  it('keeps the generic copy for a missing message', () => {
    expect(incompleteTurnNoticeMessage(undefined)).toBe(INCOMPLETE_TURN_DEFAULT_MESSAGE);
    expect(incompleteTurnNoticeMessage(null)).toBe(INCOMPLETE_TURN_DEFAULT_MESSAGE);
  });
});
