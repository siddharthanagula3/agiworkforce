import { vi } from 'vitest';

// Chrome runs one service worker and takes its timers with it when it stops.
// A test that imports the worker again leaves the earlier module instance
// alive: its reconnect timer still fires, reads the store the next test filled
// and calls the same mocks. Importing this module tracks every timer the file
// starts so endEarlierWorkers() can stop them, as terminating the worker does.
const timeouts = new Set<ReturnType<typeof setTimeout>>();
const intervals = new Set<ReturnType<typeof setInterval>>();
const startTimeout = globalThis.setTimeout;
const startInterval = globalThis.setInterval;
const stopTimeout = globalThis.clearTimeout;
const stopInterval = globalThis.clearInterval;

globalThis.setTimeout = Object.assign((...args: Parameters<typeof startTimeout>) => {
  const timer = startTimeout(...args);
  timeouts.add(timer);
  return timer;
}, startTimeout) as typeof setTimeout;

globalThis.setInterval = Object.assign((...args: Parameters<typeof startInterval>) => {
  const timer = startInterval(...args);
  intervals.add(timer);
  return timer;
}, startInterval) as typeof setInterval;

export function endEarlierWorkers(): void {
  for (const timer of timeouts) stopTimeout(timer);
  timeouts.clear();
  if (vi.isFakeTimers()) {
    // A fake clock set to advance with real time ticks on one of the tracked
    // intervals; stopping it would freeze the test. Intervals wait until the
    // real clock is back, which afterEach restores before it calls this.
    vi.clearAllTimers();
    return;
  }
  for (const timer of intervals) stopInterval(timer);
  intervals.clear();
}
