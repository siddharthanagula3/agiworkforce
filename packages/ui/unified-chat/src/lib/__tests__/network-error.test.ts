import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  httpStatusMessage,
  networkErrorMessage,
  toUserMessage,
  toUserMessageWithStatus,
} from '../network-error';

function setOnline(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);
}

afterEach(() => vi.restoreAllMocks());

describe('networkErrorMessage', () => {
  it.each([
    'Failed to fetch',
    'NetworkError when attempting to fetch resource.',
    'Load failed',
    'Network request failed',
  ])('names the condition instead of repeating the browser wording: %s', (raw) => {
    setOnline(true);
    expect(networkErrorMessage(new Error(raw))).toBe('Could not reach the server.');
  });

  it('says the user is offline when the browser reports it', () => {
    setOnline(false);
    expect(networkErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'You appear to be offline. Check your connection.',
    );
  });

  it('leaves a real server message alone', () => {
    setOnline(true);
    expect(networkErrorMessage(new Error('Rate limit exceeded'))).toBeNull();
  });
});

describe('toUserMessage', () => {
  it('never returns the raw browser wording for a dropped connection', () => {
    setOnline(true);
    expect(toUserMessage(new TypeError('Failed to fetch'), 'Failed to send message')).not.toContain(
      'Failed to fetch',
    );
  });

  it('passes a meaningful server message through unchanged', () => {
    setOnline(true);
    expect(toUserMessage(new Error('Model is overloaded'), 'fallback')).toBe('Model is overloaded');
  });

  it('falls back when the error carries nothing to say', () => {
    setOnline(true);
    for (const empty of [new Error(''), new Error('   '), undefined, null, {}]) {
      expect(toUserMessage(empty, 'Failed to send message')).toBe('Failed to send message');
    }
  });
});

describe('httpStatusMessage', () => {
  it.each([
    [401, /session has expired/i],
    [403, /do not have access/i],
    [404, /no longer available/i],
    [429, /wait a moment/i],
    [500, /on our side/i],
    [503, /on our side/i],
  ])('answers %s in words a reader can act on', (status, pattern) => {
    expect(httpStatusMessage(status)).toMatch(pattern);
  });

  it('never returns the status code itself', () => {
    for (const status of [401, 403, 404, 429, 500, 503]) {
      expect(httpStatusMessage(status)).not.toContain(String(status));
    }
  });

  it('defers when the status carries no better wording', () => {
    expect(httpStatusMessage(200)).toBeNull();
    expect(httpStatusMessage(418)).toBeNull();
    expect(httpStatusMessage(undefined)).toBeNull();
  });
});

describe('toUserMessageWithStatus', () => {
  it('prefers the network answer when the transport failed', () => {
    setOnline(false);
    const err = Object.assign(new TypeError('Failed to fetch'), { status: 500 });
    expect(toUserMessageWithStatus(err, 'fallback')).toMatch(/offline/i);
  });

  it('maps an HTTP failure rather than repeating its message', () => {
    setOnline(true);
    const err = Object.assign(new Error('HTTP 429: Too many requests'), { status: 429 });
    const out = toUserMessageWithStatus(err, 'fallback');
    expect(out).not.toContain('429');
    expect(out).not.toContain('HTTP');
  });

  it('reads statusCode as well as status', () => {
    setOnline(true);
    expect(toUserMessageWithStatus({ statusCode: 403 }, 'fallback')).toMatch(/do not have access/i);
  });

  it('recovers a status from transports that only put it in the message', () => {
    setOnline(true);
    for (const raw of ['HTTP 500', 'HTTP 500: Internal error', '  HTTP 429: slow down']) {
      const out = toUserMessageWithStatus(new Error(raw), 'fallback');
      expect(out).not.toMatch(/HTTP|\d{3}/);
    }
  });

  it('does not mistake a message that merely mentions a number', () => {
    setOnline(true);
    expect(toUserMessageWithStatus(new Error('Retry after 500 items'), 'fallback')).toBe(
      'Retry after 500 items',
    );
  });

  it('keeps a meaningful message when no status applies', () => {
    setOnline(true);
    expect(toUserMessageWithStatus(new Error('Model is overloaded'), 'fallback')).toBe(
      'Model is overloaded',
    );
  });
});
