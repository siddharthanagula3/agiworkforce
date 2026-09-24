import { describe, expect, it } from 'vitest';
import { INCOMPLETE_TURN_DEFAULT_MESSAGE, incompleteTurnNoticeMessage } from './turn-error-notice';
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
    const message = assistantMessage({ metadata: { errorCode: 'provider_rejected_request' } });
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

describe('failures a reader has to tell apart to act on', () => {
  it.each([
    ['context_length_exceeded', /too long for the selected model/i],
    ['max_output_tokens_exceeded', /maximum length/i],
    ['unsupported_attachment', /could not read one of the attachments/i],
    ['attachment_too_large', /could not read one of the attachments/i],
    ['content_filter', /safety system/i],
    ['content_blocked', /safety system/i],
    ['tool_call_invalid', /tool call/i],
    ['model_not_available', /not part of your plan/i],
    ['organization_policy', /workspace administrator/i],
    ['session_expired', /session ended/i],
    ['rolling_five_hour_limit_reached', /usage limit on your account/i],
  ])('%s reads as itself, not as the generic notice', (errorCode, expected) => {
    const text = incompleteTurnNoticeMessage(assistantMessage({ metadata: { errorCode } }));

    expect(text).toMatch(expected);
    expect(text).not.toBe(INCOMPLETE_TURN_DEFAULT_MESSAGE);
  });

  it('never gives two different failures the same sentence', () => {
    const codes = [
      'context_length_exceeded',
      'max_output_tokens_exceeded',
      'unsupported_attachment',
      'content_filter',
      'model_not_available',
      'organization_policy',
      'session_expired',
      'rolling_five_hour_limit_reached',
      'provider_timeout',
      'provider_rate_limited',
    ];
    const texts = codes.map((errorCode) =>
      incompleteTurnNoticeMessage(assistantMessage({ metadata: { errorCode } })),
    );

    expect(new Set(texts).size).toBe(codes.length);
  });

  it('never tells a reader a provider outage is a problem with their account', () => {
    const text = incompleteTurnNoticeMessage(
      assistantMessage({ metadata: { errorCode: 'provider_billing_exhausted' } }),
    );

    expect(text).not.toMatch(/your account|your plan is|you have reached/i);
  });
});

describe('the wait and the reference a reader can act on', () => {
  it('states the wait the provider asked for instead of a vague moment', () => {
    const text = incompleteTurnNoticeMessage(
      assistantMessage({
        metadata: {
          errorCode: 'provider_rate_limited',
          streamError: { message: 'x', retryAfterSeconds: 120 },
        },
      }),
    );

    expect(text).toContain('2 minutes');
  });

  it('states no wait when nothing upstream named one', () => {
    const text = incompleteTurnNoticeMessage(
      assistantMessage({ metadata: { errorCode: 'provider_rate_limited' } }),
    );

    expect(text).not.toMatch(/\d/);
  });

  it('refuses a wait too long for any honest sentence', () => {
    const text = incompleteTurnNoticeMessage(
      assistantMessage({
        metadata: {
          errorCode: 'provider_rate_limited',
          streamError: { message: 'x', retryAfterSeconds: 400000 },
        },
      }),
    );

    expect(text).not.toMatch(/\d/);
  });

  it('carries the id the server logged so a reader can quote it', () => {
    const text = incompleteTurnNoticeMessage(
      assistantMessage({
        metadata: {
          errorCode: 'provider_error',
          streamError: { message: 'x', requestId: 'req_9f2c41' },
        },
      }),
    );

    expect(text).toContain('Reference: req_9f2c41');
  });

  it('shows no reference when the failure carried none', () => {
    const text = incompleteTurnNoticeMessage(
      assistantMessage({ metadata: { errorCode: 'provider_error' } }),
    );

    expect(text).not.toContain('Reference:');
  });
});
