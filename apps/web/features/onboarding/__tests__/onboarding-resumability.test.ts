import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  stored: {} as Record<string, unknown>,
  save: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchStoredPreferenceNamespace: vi.fn(async () => mocks.stored),
  savePreferenceNamespace: (namespace: string, value: unknown) => mocks.save(namespace, value),
  refreshProfileConsumers: () => mocks.refresh(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  completeOnboarding,
  loadOnboardingSeed,
  skipOnboarding,
} from '../lib/onboarding-preferences';
import { USER_IDENTITY_SETTINGS_NAMESPACE, getOnboardingStatus } from '@/lib/server/user-identity';

function lastSave(): { namespace: string; value: Record<string, unknown> } {
  const calls = mocks.save.mock.calls;
  const call = calls[calls.length - 1];
  if (!call) throw new Error('nothing was saved');
  return { namespace: call[0] as string, value: call[1] as Record<string, unknown> };
}

/** Reads the gate the way the welcome page does, from what onboarding wrote. */
function gateAfterTheLastSave() {
  const saved = lastSave();
  const db = {
    query: async () => [{ settings: { [saved.namespace]: saved.value } }],
  } as never;
  return getOnboardingStatus(db, 'user-1');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stored = {};
  mocks.save.mockResolvedValue({ version: '1' });
  mocks.refresh.mockResolvedValue(undefined);
});

describe('coming back to onboarding', () => {
  it('writes where the gate that decides to show it reads', async () => {
    await completeOnboarding({ preferredName: 'Priya', workDescription: 'Design / UX' });

    expect(lastSave().namespace).toBe(USER_IDENTITY_SETTINGS_NAMESPACE);
  });

  it('counts a skip as answered, so the survey is not put in front of anyone twice', async () => {
    await skipOnboarding();

    await expect(gateAfterTheLastSave()).resolves.toMatchObject({ completed: true });
  });

  it('counts a finish as answered too', async () => {
    await completeOnboarding({ preferredName: 'Priya', workDescription: 'Design / UX' });

    await expect(gateAfterTheLastSave()).resolves.toMatchObject({ completed: true });
  });

  it('files nothing about the person when they skip', async () => {
    mocks.stored = { preferredName: 'Priya', workDescription: 'Design / UX' };

    await skipOnboarding();

    await expect(gateAfterTheLastSave()).resolves.toMatchObject({ primaryUseCase: null });
  });

  it('opens with what was answered before rather than an empty form', async () => {
    mocks.stored = {
      preferredName: 'Priya',
      workDescription: 'Design / UX',
      instructions: 'Answer briefly',
    };

    await expect(loadOnboardingSeed()).resolves.toEqual({
      preferredName: 'Priya',
      workDescription: 'Design / UX',
    });
  });

  it('leaves an earlier answer standing when the second pass is skipped', async () => {
    mocks.stored = {
      preferredName: 'Priya',
      workDescription: 'Design / UX',
      instructions: 'Answer briefly',
    };

    await skipOnboarding();

    expect(lastSave().value).toMatchObject({
      preferredName: 'Priya',
      workDescription: 'Design / UX',
      instructions: 'Answer briefly',
    });
  });

  it('keeps an empty answer from erasing a name the account already had', async () => {
    mocks.stored = { preferredName: 'Priya' };

    await loadOnboardingSeed();
    await skipOnboarding();

    expect(lastSave().value['preferredName']).toBe('Priya');
  });
});

const PERMISSION_REQUESTS = [
  'requestPermission',
  'getUserMedia',
  'navigator.permissions',
  'showNotification',
  'geolocation',
  'requestDevice',
];

describe('what onboarding asks the browser for', () => {
  it('asks for nothing, so no permission is spent before the reason for it exists', () => {
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    const sources: string[] = [];

    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full);
        } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
          sources.push(full);
        }
      }
    };
    walk(root);

    expect(sources.length).toBeGreaterThan(3);
    const asking = sources.filter((file) => {
      const text = readFileSync(file, 'utf8');
      return PERMISSION_REQUESTS.some((api) => text.includes(api));
    });

    expect(asking).toEqual([]);
  });
});
