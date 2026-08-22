import { describe, expect, it, afterEach, vi } from 'vitest';
import { toUserMessage, networkErrorMessage } from '../user-error-message';

function setOnline(value: boolean) {
  vi.stubGlobal('navigator', { ...globalThis.navigator, onLine: value });
}

describe('toUserMessage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['Failed to fetch'],
    ['Load failed'],
    ['NetworkError when attempting to fetch resource'],
  ])('names the condition instead of leaking %s', (browserWording) => {
    setOnline(true);
    const message = toUserMessage(new TypeError(browserWording), 'Save failed');
    expect(message).toBe('Could not reach the server.');
    expect(message).not.toContain(browserWording);
  });

  it('says offline when the browser knows the machine is', () => {
    setOnline(false);
    expect(toUserMessage(new TypeError('Failed to fetch'), 'Save failed')).toBe(
      'You appear to be offline. Check your connection.',
    );
  });

  it('keeps a real server message, which is the actionable part', () => {
    expect(toUserMessage(new Error('Quota exceeded for this workspace'), 'Save failed')).toBe(
      'Quota exceeded for this workspace',
    );
  });

  it('falls back when there is nothing usable', () => {
    expect(toUserMessage({}, 'Failed to save safety settings')).toBe(
      'Failed to save safety settings',
    );
    expect(toUserMessage(new Error('   '), 'Save failed')).toBe('Save failed');
  });

  it('leaves non-network errors alone', () => {
    expect(networkErrorMessage(new Error('403 Forbidden'))).toBeNull();
  });
});
