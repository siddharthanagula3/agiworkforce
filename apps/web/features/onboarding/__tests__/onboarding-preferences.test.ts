import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  completeOnboarding,
  loadOnboardingSeed,
  skipOnboarding,
} from '../lib/onboarding-preferences';

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

function savedNamespace(): Record<string, unknown> {
  const call = mocks.save.mock.calls.at(-1);
  if (!call) throw new Error('nothing was saved');
  return call[1] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stored = {};
  mocks.save.mockResolvedValue({ version: '1' });
  mocks.refresh.mockResolvedValue(undefined);
});

describe('what onboarding is allowed to keep', () => {
  it('records the name and the work description the user typed', async () => {
    await completeOnboarding({ preferredName: '  Priya  ', workDescription: 'Design / UX' });

    expect(savedNamespace()).toMatchObject({
      preferredName: 'Priya',
      workDescription: 'Design / UX',
    });
    expect(savedNamespace()['onboardingCompletedAt']).toEqual(expect.any(String));
  });

  it('never writes the step-2 answer, so nothing downstream can read it as a category', async () => {
    await completeOnboarding({ preferredName: 'Priya', workDescription: '' });

    expect(Object.keys(savedNamespace())).not.toContain('primaryUseCase');
  });

  it('clears a classification an earlier version of onboarding stored', async () => {
    mocks.stored = { preferredName: 'Priya', primaryUseCase: 'code' };

    await completeOnboarding({ preferredName: 'Priya', workDescription: '' });

    expect(Object.keys(savedNamespace())).not.toContain('primaryUseCase');
  });

  it('clears it on the skip path too, which writes the same namespace', async () => {
    mocks.stored = { preferredName: 'Priya', primaryUseCase: 'code' };

    await skipOnboarding();

    expect(Object.keys(savedNamespace())).not.toContain('primaryUseCase');
    expect(savedNamespace()['preferredName']).toBe('Priya');
  });

  it('leaves the other things settings owns where they were', async () => {
    mocks.stored = { instructions: 'Answer in British English', primaryUseCase: 'code' };

    await completeOnboarding({ preferredName: 'Priya', workDescription: '' });

    expect(savedNamespace()['instructions']).toBe('Answer in British English');
  });

  it('seeds the wizard from the name and role only', async () => {
    mocks.stored = {
      preferredName: 'Priya',
      workDescription: 'Design / UX',
      primaryUseCase: 'code',
    };

    await expect(loadOnboardingSeed()).resolves.toEqual({
      preferredName: 'Priya',
      workDescription: 'Design / UX',
    });
  });
});
