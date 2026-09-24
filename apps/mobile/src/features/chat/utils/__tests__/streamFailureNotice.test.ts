import { statedWait } from '@/services/failureCopy';
import {
  EMPTY_RESPONSE_FAILURE,
  getMessageStreamErrorReference,
  getMessageStreamErrorRetryAfter,
  parseStreamFailure,
  streamFailureNoticeText,
} from '../messageStreamError';

describe('the frame a mid-stream failure arrives in', () => {
  it('keeps the wait and the reference the gateway sent', () => {
    expect(
      parseStreamFailure({
        message: 'This model is overloaded right now.',
        code: 'provider_overloaded',
        retryable: true,
        retryAfterSeconds: 120,
        requestId: 'req_9f2c',
      }),
    ).toEqual({
      message: 'This model is overloaded right now.',
      code: 'provider_overloaded',
      retryable: true,
      retryAfterSeconds: 120,
      requestId: 'req_9f2c',
    });
  });

  it('invents neither field when the frame carried neither', () => {
    const parsed = parseStreamFailure({ message: 'The model could not be reached.' });
    expect(parsed).toEqual({ message: 'The model could not be reached.' });
    expect(parsed).not.toHaveProperty('retryAfterSeconds');
    expect(parsed).not.toHaveProperty('requestId');
  });

  it('refuses a wait no provider could have measured', () => {
    expect(parseStreamFailure({ message: 'busy', retryAfterSeconds: 200_000 })).toEqual({
      message: 'busy',
    });
    expect(parseStreamFailure({ message: 'busy', retryAfterSeconds: 0 })).toEqual({
      message: 'busy',
    });
    expect(parseStreamFailure({ message: 'busy', retryAfterSeconds: '90' })).toEqual({
      message: 'busy',
    });
  });

  it('still accepts a bare string and still rejects a frame with no message', () => {
    expect(parseStreamFailure('rate limited')).toEqual({ message: 'rate limited' });
    expect(parseStreamFailure({ code: 'provider_error' })).toBeUndefined();
    expect(parseStreamFailure(undefined)).toBeUndefined();
  });
});

describe('the wait a reader is told to sit out', () => {
  it('reads in the unit the length deserves', () => {
    expect(statedWait(1)).toBe('about 1 second');
    expect(statedWait(45)).toBe('about 45 seconds');
    expect(statedWait(120)).toBe('about 2 minutes');
    expect(statedWait(7_200)).toBe('about 2 hours');
  });

  it('is absent for anything nobody supplied or nobody could believe', () => {
    expect(statedWait(undefined)).toBeUndefined();
    expect(statedWait(0)).toBeUndefined();
    expect(statedWait(86_401)).toBeUndefined();
  });
});

describe('what a reader sees under a failed turn', () => {
  it('does not call a turn that produced nothing an incomplete response', () => {
    const notice = streamFailureNoticeText({
      content: '',
      metadata: { streamError: EMPTY_RESPONSE_FAILURE },
    });
    expect(notice).toBe('The model finished without returning a response. Try again.');
    expect(notice).not.toContain('may be incomplete');
  });

  it('says a partial answer may be cut off, because that one is', () => {
    expect(
      streamFailureNoticeText({
        content: 'half an answer',
        metadata: { streamError: { message: 'The model could not be reached.' } },
      }),
    ).toBe('Response may be incomplete: The model could not be reached.');
  });

  it('ends a failed turn with the id the server logged', () => {
    expect(
      streamFailureNoticeText({
        content: '',
        metadata: {
          streamError: { message: 'The model failed to produce a response.', requestId: 'req_41a' },
        },
      }),
    ).toBe('The model failed to produce a response. Reference: req_41a');
  });

  it('states a wait the gateway supplied and the sentence left out', () => {
    expect(
      streamFailureNoticeText({
        content: '',
        metadata: {
          streamError: {
            message: 'This model is overloaded right now.',
            retryAfterSeconds: 120,
          },
        },
      }),
    ).toBe('This model is overloaded right now. Try again in about 2 minutes.');
  });

  it('never states the same wait twice when the sentence already carries it', () => {
    const notice = streamFailureNoticeText({
      content: '',
      metadata: {
        streamError: {
          message: 'The free model is busy right now. Try again in about 45 seconds.',
          retryAfterSeconds: 45,
        },
      },
    });
    expect(notice).toBe('The free model is busy right now. Try again in about 45 seconds.');
    expect(notice.match(/45 seconds/g)).toHaveLength(1);
  });

  it('falls back to the sentence web uses when nothing named the failure', () => {
    expect(streamFailureNoticeText({ content: '', metadata: { finishReason: 'error' } })).toBe(
      "This turn didn't complete. No response was received.",
    );
    expect(
      streamFailureNoticeText({ content: 'half an answer', metadata: { finishReason: 'error' } }),
    ).toBe('Response may be incomplete');
  });
});

describe('the two fields a surface must not swallow', () => {
  it('reads them back off a persisted turn', () => {
    const message = {
      metadata: { streamError: { message: 'busy', retryAfterSeconds: 90, requestId: 'req_7' } },
    };
    expect(getMessageStreamErrorRetryAfter(message)).toBe(90);
    expect(getMessageStreamErrorReference(message)).toBe('req_7');
  });

  it('reports nothing for a turn that carried nothing', () => {
    expect(getMessageStreamErrorRetryAfter({ metadata: { streamError: 'busy' } })).toBeUndefined();
    expect(getMessageStreamErrorReference({ metadata: {} })).toBeUndefined();
    expect(getMessageStreamErrorReference(null)).toBeUndefined();
  });
});
