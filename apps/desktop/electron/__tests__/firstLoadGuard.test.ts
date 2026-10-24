import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIRST_LOAD_GIVE_UP_AFTER_MS,
  FIRST_LOAD_SHOW_AFTER_MS,
  guardFirstLoad,
} from '../firstLoadGuard';

function actions() {
  return {
    showWindow: vi.fn(),
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
    giveUp: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a first load that is slow or hangs', () => {
  it('shows nothing extra when the page draws in time', () => {
    const spies = actions();
    const guard = guardFirstLoad(spies);

    vi.advanceTimersByTime(FIRST_LOAD_SHOW_AFTER_MS - 1);
    guard.settled();
    vi.advanceTimersByTime(FIRST_LOAD_GIVE_UP_AFTER_MS);

    expect(spies.showWindow).toHaveBeenCalledTimes(1);
    expect(spies.showLoading).not.toHaveBeenCalled();
    expect(spies.hideLoading).not.toHaveBeenCalled();
    expect(spies.giveUp).not.toHaveBeenCalled();
  });

  it('shows the window with the loading state after about a second', () => {
    const spies = actions();
    guardFirstLoad(spies);

    vi.advanceTimersByTime(FIRST_LOAD_SHOW_AFTER_MS);

    expect(spies.showLoading).toHaveBeenCalledTimes(1);
    expect(spies.showWindow).not.toHaveBeenCalled();
  });

  it('takes the loading state away when the page finally draws', () => {
    const spies = actions();
    const guard = guardFirstLoad(spies);
    vi.advanceTimersByTime(FIRST_LOAD_SHOW_AFTER_MS);

    guard.settled();

    expect(spies.hideLoading).toHaveBeenCalledTimes(1);
    expect(spies.showWindow).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(FIRST_LOAD_GIVE_UP_AFTER_MS);
    expect(spies.giveUp).not.toHaveBeenCalled();
  });

  it('switches to the unreachable screen after the timeout, and only once', () => {
    const spies = actions();
    const guard = guardFirstLoad(spies);

    vi.advanceTimersByTime(FIRST_LOAD_GIVE_UP_AFTER_MS);
    guard.settled();
    vi.advanceTimersByTime(FIRST_LOAD_GIVE_UP_AFTER_MS);

    expect(spies.giveUp).toHaveBeenCalledTimes(1);
    expect(spies.hideLoading).toHaveBeenCalledTimes(1);
    expect(spies.showWindow).not.toHaveBeenCalled();
  });

  it('gives up only after the loading state has been shown', () => {
    expect(FIRST_LOAD_SHOW_AFTER_MS).toBeLessThan(FIRST_LOAD_GIVE_UP_AFTER_MS);
  });

  it('does nothing further once the window closes', () => {
    const spies = actions();
    const guard = guardFirstLoad(spies);
    vi.advanceTimersByTime(FIRST_LOAD_SHOW_AFTER_MS);

    guard.cancel();
    vi.advanceTimersByTime(FIRST_LOAD_GIVE_UP_AFTER_MS);

    expect(spies.hideLoading).toHaveBeenCalledTimes(1);
    expect(spies.giveUp).not.toHaveBeenCalled();
    expect(spies.showWindow).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
