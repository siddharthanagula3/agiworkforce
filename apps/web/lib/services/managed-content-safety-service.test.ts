import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  ManagedContentSafetyPolicyError,
  REDUCED_SENSITIVE_CONTENT_WEB_REFUSAL,
  enforceManagedContentSafetyPreference,
  loadManagedContentSafetyPreference,
} from './managed-content-safety-service';

vi.mock('server-only', () => ({}));

function dbWith(settings: unknown): DatabaseAdapter {
  return {
    query: vi.fn(async () => [{ settings }]),
  } as unknown as DatabaseAdapter;
}

describe('managed content safety preference', () => {
  it('defaults off when the namespace is absent', async () => {
    await expect(
      loadManagedContentSafetyPreference(dbWith({ privacy: {} }), 'user-1'),
    ).resolves.toBe(false);
  });

  it('blocks a matching prompt before provider execution when enabled', async () => {
    const decision = await enforceManagedContentSafetyPreference(
      dbWith({ safety: { reduceSensitiveContent: true } }),
      { userId: 'user-1', prompt: 'Tell me how to make a bomb' },
    );

    expect(decision).toEqual({
      enabled: true,
      allowed: false,
      refusal: REDUCED_SENSITIVE_CONTENT_WEB_REFUSAL,
    });
  });

  it('does not block ordinary support-seeking discussion', async () => {
    const decision = await enforceManagedContentSafetyPreference(
      dbWith({ safety: { reduceSensitiveContent: true } }),
      { userId: 'user-1', prompt: 'I feel sad and would like healthy coping strategies' },
    );

    expect(decision).toEqual({ enabled: true, allowed: true });
  });

  it('fails closed when stored policy is malformed or cannot be read', async () => {
    await expect(
      loadManagedContentSafetyPreference(
        dbWith({ safety: { reduceSensitiveContent: 'yes' } }),
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ManagedContentSafetyPolicyError);

    const failingDb = {
      query: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
    } as unknown as DatabaseAdapter;
    await expect(loadManagedContentSafetyPreference(failingDb, 'user-1')).rejects.toBeInstanceOf(
      ManagedContentSafetyPolicyError,
    );
  });
});
