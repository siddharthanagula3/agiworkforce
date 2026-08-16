
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
    process.env['AGIWORKFORCE_BROWSER_PROFILE_ROOT'] = '/tmp/agi-test-profiles';

    const { openProfile, closeAllProfiles, listProfiles } = await import('../profile');

    await openProfile('alpha');
    await openProfile('beta');
    await openProfile('gamma');

    void listProfiles;

    await closeAllProfiles();
    expect(closes.count).toBe(3);
    expect(closes.dirs).toHaveLength(3);
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
    await expect(closeProfile('flaky')).resolves.toBeUndefined();
    expect(closes.count).toBe(1);
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
