
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ONBOARDING_COMPLETE_KEY,
  isOnboardingComplete,
  markOnboardingComplete,
} from '../src/features/side-panel/onboarding';

function buildStorageMock(initialData: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initialData };
  return {
    get(defaults: Record<string, unknown>, cb: (items: Record<string, unknown>) => void): void {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(defaults)) {
        result[key] = key in store ? store[key] : defaults[key];
      }
      cb(result);
    },
    set(items: Record<string, unknown>): Promise<void> {
      Object.assign(store, items);
      return Promise.resolve();
    },
    _store: store,
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('ONBOARDING_COMPLETE_KEY', () => {
  it('is the expected storage key', () => {
    expect(ONBOARDING_COMPLETE_KEY).toBe('agi_onboarding_completed');
  });
});

describe('isOnboardingComplete()', () => {
  it('returns false when flag is absent (fresh install)', async () => {
    const storageMock = buildStorageMock({});
    vi.stubGlobal('chrome', {
      storage: { local: storageMock },
      runtime: { lastError: null },
    });
    const result = await isOnboardingComplete();
    expect(result).toBe(false);
  });

  it('returns false when flag is explicitly false', async () => {
    const storageMock = buildStorageMock({ [ONBOARDING_COMPLETE_KEY]: false });
    vi.stubGlobal('chrome', {
      storage: { local: storageMock },
      runtime: { lastError: null },
    });
    const result = await isOnboardingComplete();
    expect(result).toBe(false);
  });

  it('returns true when flag is true', async () => {
    const storageMock = buildStorageMock({ [ONBOARDING_COMPLETE_KEY]: true });
    vi.stubGlobal('chrome', {
      storage: { local: storageMock },
      runtime: { lastError: null },
    });
    const result = await isOnboardingComplete();
    expect(result).toBe(true);
  });

  it('resolves false when chrome.storage throws (jsdom guard)', async () => {
    vi.stubGlobal('chrome', undefined);
    const result = await isOnboardingComplete();
    expect(result).toBe(false);
  });

  it('resolves false when chrome.runtime.lastError is set', async () => {
    const storageMock = buildStorageMock({});
    vi.stubGlobal('chrome', {
      storage: { local: storageMock },
      runtime: { lastError: { message: 'Extension context invalid' } },
    });
    const result = await isOnboardingComplete();
    expect(result).toBe(false);
  });
});

describe('markOnboardingComplete()', () => {
  it('sets the completed flag in storage', async () => {
    const storageMock = buildStorageMock({});
    vi.stubGlobal('chrome', {
      storage: { local: storageMock },
      runtime: { lastError: null },
    });
    markOnboardingComplete();
    await Promise.resolve();
    expect(storageMock._store[ONBOARDING_COMPLETE_KEY]).toBe(true);
  });

  it('does not throw when chrome.storage is unavailable (jsdom guard)', () => {
    vi.stubGlobal('chrome', undefined);
    expect(() => markOnboardingComplete()).not.toThrow();
  });

  it('after markOnboardingComplete, isOnboardingComplete returns true', async () => {
    const storageMock = buildStorageMock({});
    vi.stubGlobal('chrome', {
      storage: { local: storageMock },
      runtime: { lastError: null },
    });
    markOnboardingComplete();
    await Promise.resolve();
    const result = await isOnboardingComplete();
    expect(result).toBe(true);
  });
});
