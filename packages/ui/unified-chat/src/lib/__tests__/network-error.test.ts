import { afterEach, describe, expect, it, vi } from 'vitest';

import { networkErrorMessage, toUserMessage } from '../network-error';

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
