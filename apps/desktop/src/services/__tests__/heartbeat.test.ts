import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { startDesktopHeartbeat } from '../heartbeat';

function setVisible() {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
}

function setHidden() {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  });
}

describe('heartbeat lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisible();
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisible();
  });

  it('starts and cleans up without writing to cloud storage', () => {
    const cleanup = startDesktopHeartbeat('user-1');
    expect(cleanup).toEqual(expect.any(Function));

    cleanup();

    expect(() => vi.advanceTimersByTime(180_000)).not.toThrow();
  });

  it('skips timer work while hidden and resumes lifecycle while visible', () => {
    const cleanup = startDesktopHeartbeat('user-1');

    setHidden();
    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();

    setVisible();
    expect(() => document.dispatchEvent(new Event('visibilitychange'))).not.toThrow();

    cleanup();
  });

  it('detaches the visibility listener on cleanup', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const cleanup = startDesktopHeartbeat('user-1');
    const addCall = addSpy.mock.calls.find(([type]) => type === 'visibilitychange');
    expect(addCall).toBeDefined();

    cleanup();

    const registeredHandler = addCall?.[1];
    const removeCall = removeSpy.mock.calls.find(
      ([type, handler]) => type === 'visibilitychange' && handler === registeredHandler,
    );
    expect(removeCall).toBeDefined();

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
