import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  TIER_CACHE_TTL_MS,
  isAccountTierStale,
  markAccountTierStale,
  recordAccountIdentityTier,
  resolveTier,
  watchAccountTierInvalidation,
} from '../integrations/tierResolver';
import {
  clearAccountTierRevalidationListener,
  notifyAccountTierMayHaveChanged,
} from '../integrations/tierRevalidation';
import { isModelReachableForTier } from '../features/model-picker/modelConstants';
import { getCoreManualModelOptions } from '@agiworkforce/types';

/** A model the picker offers on Max and refuses on Free, read from the catalog. */
function paidOnlyModelId(): string {
  const model = getCoreManualModelOptions().find(
    (candidate) =>
      isModelReachableForTier(candidate.id, 'max') &&
      !isModelReachableForTier(candidate.id, 'free'),
  );
  if (!model) throw new Error('The catalog must expose a model gated above Free');
  return model.id;
}

function makeContext(state: Record<string, unknown> = {}): vscode.ExtensionContext {
  const store = new Map<string, unknown>(Object.entries(state));
  return {
    secrets: { get: vi.fn(), store: vi.fn(), delete: vi.fn() },
    globalState: {
      get: (key: string) => store.get(key),
      update: (key: string, value: unknown) => {
        if (value === undefined) store.delete(key);
        else store.set(key, value);
        return Promise.resolve();
      },
      keys: () => [...store.keys()],
      setKeysForSync: vi.fn(),
    },
  } as unknown as vscode.ExtensionContext;
}

function stubConfiguration(): void {
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: vi.fn(),
    inspect: vi.fn(),
    has: vi.fn().mockReturnValue(false),
    update: vi.fn(),
  } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAccountTierRevalidationListener();
  stubConfiguration();
});

describe('cached plan tier revalidation', () => {
  it('matches the CLI cache window of five minutes', () => {
    expect(TIER_CACHE_TTL_MS).toBe(300_000);
  });

  it('leaves a freshly stamped cache alone and never calls the account API', async () => {
    const context = makeContext({
      'tierStatus.cachedTier': 'max',
      'tierStatus.cachedAtMs': Date.now(),
    });
    const loadTier = vi.fn();

    await expect(resolveTier(context, loadTier)).resolves.toBe('max');
    expect(loadTier).not.toHaveBeenCalled();
  });

  it('re-reads the tier once the TTL has elapsed', async () => {
    const context = makeContext({
      'tierStatus.cachedTier': 'max',
      'tierStatus.cachedAtMs': Date.now() - TIER_CACHE_TTL_MS - 1,
    });
    const loadTier = vi.fn().mockResolvedValue({ tier: 'pro' });

    await expect(resolveTier(context, loadTier)).resolves.toBe('pro');
    expect(loadTier).toHaveBeenCalledTimes(1);
    expect(context.globalState.get('tierStatus.cachedTier')).toBe('pro');
    expect(isAccountTierStale(context)).toBe(false);
  });

  it('keeps the last verified tier when the account API is unreachable', async () => {
    const context = makeContext({
      'tierStatus.cachedTier': 'max',
      'tierStatus.cachedAtMs': Date.now() - TIER_CACHE_TTL_MS - 1,
    });
    const loadTier = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(resolveTier(context, loadTier)).resolves.toBe('max');
    expect(context.globalState.get('tierStatus.cachedTier')).toBe('max');
    expect(isAccountTierStale(context)).toBe(true);
  });

  it('collapses concurrent reads into one account call', async () => {
    const context = makeContext({ 'tierStatus.cachedTier': 'max' });
    const loadTier = vi.fn().mockResolvedValue({ tier: 'pro' });

    const [first, second] = await Promise.all([
      resolveTier(context, loadTier),
      resolveTier(context, loadTier),
    ]);

    expect(first).toBe('pro');
    expect(second).toBe('pro');
    expect(loadTier).toHaveBeenCalledTimes(1);
  });

  it('marks the cache stale on a 401 or quota refusal from any hosted call', async () => {
    const context = makeContext({
      'tierStatus.cachedTier': 'max',
      'tierStatus.cachedAtMs': Date.now(),
    });
    watchAccountTierInvalidation(context);
    expect(isAccountTierStale(context)).toBe(false);

    notifyAccountTierMayHaveChanged();
    await Promise.resolve();

    expect(isAccountTierStale(context)).toBe(true);
    expect(context.globalState.get('tierStatus.cachedTier')).toBe('max');
  });

  it('re-reads immediately after an invalidation rather than waiting out the TTL', async () => {
    const context = makeContext({
      'tierStatus.cachedTier': 'max',
      'tierStatus.cachedAtMs': Date.now(),
    });
    watchAccountTierInvalidation(context);
    const loadTier = vi.fn().mockResolvedValue({ tier: 'free' });

    notifyAccountTierMayHaveChanged();
    await Promise.resolve();

    await expect(resolveTier(context, loadTier)).resolves.toBe('free');
    expect(loadTier).toHaveBeenCalledTimes(1);
  });

  it('records the tier a successful account identity read already reported', async () => {
    const context = makeContext({ 'tierStatus.cachedTier': 'free' });

    await expect(recordAccountIdentityTier(context, 'Max_15x')).resolves.toBe('max_15x');
    expect(context.globalState.get('tierStatus.cachedTier')).toBe('max_15x');
    expect(isAccountTierStale(context)).toBe(false);
  });

  it('ignores an unrecognised tier from an account identity read', async () => {
    const context = makeContext({
      'tierStatus.cachedTier': 'pro',
      'tierStatus.cachedAtMs': Date.now(),
    });

    await expect(recordAccountIdentityTier(context, 'platinum')).resolves.toBeUndefined();
    expect(context.globalState.get('tierStatus.cachedTier')).toBe('pro');
  });

  it('re-gates the model picker when the account reports a downgrade', async () => {
    const modelId = paidOnlyModelId();
    const context = makeContext({
      'tierStatus.cachedTier': 'max',
      'tierStatus.cachedAtMs': Date.now(),
    });
    expect(isModelReachableForTier(modelId, await resolveTier(context, vi.fn()))).toBe(true);

    await markAccountTierStale(context);
    const downgraded = await resolveTier(context, vi.fn().mockResolvedValue({ tier: 'free' }));

    expect(downgraded).toBe('free');
    expect(isModelReachableForTier(modelId, downgraded)).toBe(false);
  });
});
