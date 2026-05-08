/**
 * Regression tests for profile lifecycle and multi-tab cleanup.
 *
 * Background: the profile registry holds open Chromium contexts in a module
 * level Map (`open` in profile.ts). If `closeAllProfiles()` doesn't drain
 * every entry on shutdown, the host app keeps file handles open and can't
 * cleanly exit. We never spawn real Chromium in unit tests — instead we
 * inject fake contexts into the registry via the public open/close API
 * (using a stubbed playwright module).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface FakeContext {
  pages: () => Array<{ url: () => string }>;
  newPage: () => Promise<{ url: () => string }>;
  close: () => Promise<void>;
}

interface FakeChromium {
  launchPersistentContext: (dir: string, opts: unknown) => Promise<FakeContext>;
}

function makeFakeChromium(closes: { count: number; dirs: string[] }): FakeChromium {
  return {
    launchPersistentContext: vi.fn(async (dir: string) => {
      const fakePage = { url: () => 'about:blank' };
      const ctx: FakeContext = {
        pages: () => [fakePage],
        newPage: vi.fn(async () => fakePage),
        close: vi.fn(async () => {
          closes.count += 1;
          closes.dirs.push(dir);
        }),
      };
      return ctx;
    }),
  };
}

describe('profile lifecycle (multi-tab dangling cleanup)', () => {
  it('closeAllProfiles closes every open context', async () => {
    const closes = { count: 0, dirs: [] as string[] };
    vi.doMock('playwright-core', () => ({ chromium: makeFakeChromium(closes) }));
    // Ensure the profile root resolves into a tmp dir for the test, not the
    // user's real home.
    process.env['AGIWORKFORCE_BROWSER_PROFILE_ROOT'] = '/tmp/agi-test-profiles';

    const { openProfile, closeAllProfiles, listProfiles } = await import('../profile');

    await openProfile('alpha');
    await openProfile('beta');
    await openProfile('gamma');

    // listProfiles walks the on-disk root; in a fresh tmp dir without any
    // pre-created subdirs, it returns nothing. We trust the open->close
    // bookkeeping rather than fs walking here.
    void listProfiles;

    await closeAllProfiles();
    expect(closes.count).toBe(3);
    expect(closes.dirs).toHaveLength(3);
    // Reopening a freshly-closed profile name must build a NEW context
    // (the registry was drained).
    await openProfile('alpha');
    await closeAllProfiles();
    expect(closes.count).toBe(4);

    delete process.env['AGIWORKFORCE_BROWSER_PROFILE_ROOT'];
  });

  it('closeProfile is idempotent and tolerant to context.close() throwing', async () => {
    const closes = { count: 0, dirs: [] as string[] };
    vi.doMock('playwright-core', () => ({
      chromium: {
        launchPersistentContext: vi.fn(async () => {
          const ctx: FakeContext = {
            pages: () => [{ url: () => 'about:blank' }],
            newPage: vi.fn(async () => ({ url: () => 'about:blank' })),
            close: vi.fn(async () => {
              closes.count += 1;
              throw new Error('simulated close failure');
            }),
          };
          return ctx;
        }),
      },
    }));
    process.env['AGIWORKFORCE_BROWSER_PROFILE_ROOT'] = '/tmp/agi-test-profiles';

    const { openProfile, closeProfile } = await import('../profile');
    await openProfile('flaky');
    // First close attempts to close (throws internally — caught).
    await expect(closeProfile('flaky')).resolves.toBeUndefined();
    expect(closes.count).toBe(1);
    // Second close is a no-op (registry already drained).
    await expect(closeProfile('flaky')).resolves.toBeUndefined();
    expect(closes.count).toBe(1);

    delete process.env['AGIWORKFORCE_BROWSER_PROFILE_ROOT'];
  });

  it('opening the same profile twice reuses one context (no double-launch)', async () => {
    const closes = { count: 0, dirs: [] as string[] };
    const launchSpy = vi.fn(async () => {
      const ctx: FakeContext = {
        pages: () => [{ url: () => 'about:blank' }],
        newPage: vi.fn(async () => ({ url: () => 'about:blank' })),
        close: vi.fn(async () => {
          closes.count += 1;
        }),
      };
      return ctx;
    });
    vi.doMock('playwright-core', () => ({
      chromium: { launchPersistentContext: launchSpy },
    }));
    process.env['AGIWORKFORCE_BROWSER_PROFILE_ROOT'] = '/tmp/agi-test-profiles';

    const { openProfile, closeAllProfiles } = await import('../profile');
    const a = await openProfile('singleton');
    const b = await openProfile('singleton');
    expect(a).toBe(b);
    expect(launchSpy).toHaveBeenCalledTimes(1);
    await closeAllProfiles();
    expect(closes.count).toBe(1);

    delete process.env['AGIWORKFORCE_BROWSER_PROFILE_ROOT'];
  });
});
