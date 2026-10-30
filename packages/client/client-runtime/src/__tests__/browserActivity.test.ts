import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_ACTIVITY_IDLE_MS, createBrowserActivityTracker } from '../browserActivity';

function browser() {
  const page = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const view = new EventTarget();
  const tracker = createBrowserActivityTracker({
    document: page as unknown as Document,
    window: view as unknown as Window,
  });
  return { page, view, tracker };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('browser activity', () => {
  it('expires by elapsed time even before a delayed idle timer runs, then notifies on return', () => {
    const { page, tracker } = browser();
    const changed = vi.fn();
    const stop = tracker.subscribe(changed);
    vi.setSystemTime(Date.now() + BROWSER_ACTIVITY_IDLE_MS + 1);
    expect(changed).not.toHaveBeenCalled();
    expect(tracker.isActive()).toBe(false);
    page.dispatchEvent(new Event('keydown'));
    expect(tracker.isActive()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    stop();
  });

  it('marks a visible but untouched page idle and resumes on interaction', () => {
    const { page, tracker } = browser();
    const changed = vi.fn();
    const stop = tracker.subscribe(changed);
    expect(tracker.isActive()).toBe(true);
    vi.advanceTimersByTime(BROWSER_ACTIVITY_IDLE_MS);
    expect(tracker.isActive()).toBe(false);
    page.dispatchEvent(new Event('keydown'));
    expect(tracker.isActive()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(2);
    stop();
  });

  it('extends activity without notifying every subscriber on every keystroke', () => {
    const { page, tracker } = browser();
    const changed = vi.fn();
    const stop = tracker.subscribe(changed);
    vi.advanceTimersByTime(BROWSER_ACTIVITY_IDLE_MS - 1);
    page.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(BROWSER_ACTIVITY_IDLE_MS - 1);
    expect(tracker.isActive()).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    stop();
  });

  it('stays inactive while hidden even if an input event arrives', () => {
    const { page, tracker } = browser();
    const stop = tracker.subscribe(vi.fn());
    page.visibilityState = 'hidden';
    page.dispatchEvent(new Event('visibilitychange'));
    page.dispatchEvent(new Event('pointerdown'));
    expect(tracker.isActive()).toBe(false);
    page.visibilityState = 'visible';
    page.dispatchEvent(new Event('visibilitychange'));
    expect(tracker.isActive()).toBe(true);
    stop();
  });

  it('pauses on blur and shares one deadline across subscribers', () => {
    const { view, tracker } = browser();
    const stopFirst = tracker.subscribe(vi.fn());
    const changed = vi.fn();
    const stopSecond = tracker.subscribe(changed);
    expect(vi.getTimerCount()).toBe(1);
    stopFirst();
    view.dispatchEvent(new Event('blur'));
    expect(tracker.isActive()).toBe(false);
    view.dispatchEvent(new Event('focus'));
    expect(tracker.isActive()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(2);
    stopSecond();
    expect(vi.getTimerCount()).toBe(0);
  });
});
