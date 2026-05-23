/**
 * Updater interval logic tests
 *
 * Verifies the check-interval skip behaviour: UpdateChecker should not
 * re-check within `checkIntervalHours` of the last successful check.
 * Tests are pure store/utility logic — no Tauri runtime required.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers — replicate the interval check logic from UpdateChecker.tsx
// so it can be tested without rendering the component.
// ---------------------------------------------------------------------------

function shouldSkipCheck(
  lastCheckTime: number | null,
  checkIntervalHours: number,
  now: number,
): boolean {
  if (!lastCheckTime) return false;
  const intervalMs = checkIntervalHours * 60 * 60 * 1000;
  return now - lastCheckTime < intervalMs;
}

describe('Updater check-interval skip logic', () => {
  const ONE_HOUR_MS = 60 * 60 * 1000;

  it('does not skip when lastCheckTime is null (first launch)', () => {
    expect(shouldSkipCheck(null, 4, Date.now())).toBe(false);
  });

  it('skips when last check was less than checkIntervalHours ago', () => {
    const now = Date.now();
    const lastCheck = now - ONE_HOUR_MS; // 1h ago, interval is 4h
    expect(shouldSkipCheck(lastCheck, 4, now)).toBe(true);
  });

  it('does not skip when last check was more than checkIntervalHours ago', () => {
    const now = Date.now();
    const lastCheck = now - 5 * ONE_HOUR_MS; // 5h ago, interval is 4h
    expect(shouldSkipCheck(lastCheck, 4, now)).toBe(false);
  });

  it('skips exactly at boundary (just under interval)', () => {
    const now = Date.now();
    const lastCheck = now - (4 * ONE_HOUR_MS - 1); // 1ms short of 4h
    expect(shouldSkipCheck(lastCheck, 4, now)).toBe(true);
  });

  it('does not skip exactly at interval boundary (equal to interval)', () => {
    const now = Date.now();
    const lastCheck = now - 4 * ONE_HOUR_MS; // exactly 4h ago
    expect(shouldSkipCheck(lastCheck, 4, now)).toBe(false);
  });

  it('respects a custom 6-hour interval', () => {
    const now = Date.now();
    const lastCheck = now - 5 * ONE_HOUR_MS; // 5h ago, interval is 6h → skip
    expect(shouldSkipCheck(lastCheck, 6, now)).toBe(true);
  });

  it('does not skip for 6h interval when 7h have passed', () => {
    const now = Date.now();
    const lastCheck = now - 7 * ONE_HOUR_MS;
    expect(shouldSkipCheck(lastCheck, 6, now)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Store integration: setLastCheckTime persists and is readable
// ---------------------------------------------------------------------------

describe('UpdaterStore check-time persistence', () => {
  beforeEach(async () => {
    const { useUpdaterStore } = await import('../stores/updaterStore');
    useUpdaterStore.getState().reset();
  });

  it('starts with null lastCheckTime', async () => {
    const { useUpdaterStore } = await import('../stores/updaterStore');
    expect(useUpdaterStore.getState().lastCheckTime).toBeNull();
  });

  it('stores lastCheckTime after setLastCheckTime', async () => {
    const { useUpdaterStore } = await import('../stores/updaterStore');
    const now = Date.now();
    useUpdaterStore.getState().setLastCheckTime(now);
    expect(useUpdaterStore.getState().lastCheckTime).toBe(now);
  });

  it('default checkIntervalHours is 24', async () => {
    const { useUpdaterStore } = await import('../stores/updaterStore');
    expect(useUpdaterStore.getState().checkIntervalHours).toBe(24);
  });

  it('setCheckIntervalHours updates the interval', async () => {
    const { useUpdaterStore } = await import('../stores/updaterStore');
    useUpdaterStore.getState().setCheckIntervalHours(6);
    expect(useUpdaterStore.getState().checkIntervalHours).toBe(6);
    useUpdaterStore.getState().setCheckIntervalHours(24); // restore
  });
});
