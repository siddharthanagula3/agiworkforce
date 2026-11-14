import { afterAll } from 'vitest';

const intervalsStartedByTheFile = new Set<ReturnType<typeof setInterval>>();
const nativeSetInterval = globalThis.setInterval;
const nativeClearInterval = globalThis.clearInterval;

globalThis.setInterval = Object.assign((...args: Parameters<typeof nativeSetInterval>) => {
  const interval = nativeSetInterval(...args);
  intervalsStartedByTheFile.add(interval);
  return interval;
}, nativeSetInterval) as typeof setInterval;

afterAll(() => {
  for (const interval of intervalsStartedByTheFile) nativeClearInterval(interval);
  intervalsStartedByTheFile.clear();
});
