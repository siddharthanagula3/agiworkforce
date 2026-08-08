import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { debounce } from '../async';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the trailing call once after the quiet period', () => {
    const spy = vi.fn();
    const debounced = debounce(spy, 300);

    debounced('a');
    debounced('ab');
    debounced('abc');
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledExactlyOnceWith('abc');
  });

  it('cancel() drops the pending call so it can never fire', () => {
    // This is the unmount contract. Without it a debounced state setter fires
    // against a torn-down React tree — in jsdom that surfaces as an uncaught
    // `window is not defined` from resolveUpdatePriority, attributed to
    // whichever test file happened to be running when the timer expired.
    const spy = vi.fn();
    const debounced = debounce(spy, 300);

    debounced('pending');
    debounced.cancel();

    vi.advanceTimersByTime(10_000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('cancel() is idempotent and safe after the call already fired', () => {
    const spy = vi.fn();
    const debounced = debounce(spy, 300);

    debounced('a');
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledOnce();

    expect(() => {
      debounced.cancel();
      debounced.cancel();
    }).not.toThrow();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('accepts new calls after a cancel', () => {
    const spy = vi.fn();
    const debounced = debounce(spy, 300);

    debounced('dropped');
    debounced.cancel();
    debounced('kept');

    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledExactlyOnceWith('kept');
  });
});
