import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { guardProviderSwitch } from '../integrations/providerSwitchGuard';
import {
  clearAccountTierCache,
  refreshAccountTierCache,
  resolveTier,
} from '../integrations/tierResolver';
import { requireCatalogModel } from './catalogModelFixtures';

const FIRST_PROVIDER_MODEL = requireCatalogModel('anthropic').id;
const SECOND_PROVIDER_MODEL = requireCatalogModel('openai').id;

function makeContext(cachedTier?: string, cachedAtMs?: number): vscode.ExtensionContext {
  const state = new Map<string, unknown>();
  if (cachedTier !== undefined) state.set('tierStatus.cachedTier', cachedTier);
  if (cachedAtMs !== undefined) state.set('tierStatus.cachedAtMs', cachedAtMs);
  return {
    secrets: { get: vi.fn(), store: vi.fn(), delete: vi.fn() },
    globalState: {
      get: (key: string) => state.get(key),
      update: vi.fn((key: string, value: unknown) => {
        if (value === undefined) state.delete(key);
        else state.set(key, value);
        return Promise.resolve();
      }),
      keys: () => [...state.keys()],
      setKeysForSync: vi.fn(),
    },
  } as unknown as vscode.ExtensionContext;
}

/** Every fresh-cache case pins the TTL stamp so no case reaches the network. */
function fresh(cachedTier?: string): vscode.ExtensionContext {
  return makeContext(cachedTier, Date.now());
}

const neverLoads = () => Promise.resolve(undefined);

function stubConfiguration(): void {
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: vi.fn(),
    inspect: vi.fn(),
    has: vi.fn().mockReturnValue(false),
    update: vi.fn(),
  } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
}

describe('resolveTier account-owned entitlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignores removed legacy tier settings and falls back to BYOK', async () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn(),
      inspect: vi.fn((key: string) =>
        key === 'tier' ? { globalValue: 'max', workspaceValue: 'enterprise' } : undefined,
      ),
      has: vi.fn().mockReturnValue(false),
      update: vi.fn(),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);

    await expect(resolveTier(fresh(), neverLoads)).resolves.toBe('byok');
  });

  it('uses the cached account tier', async () => {
    stubConfiguration();

    await expect(resolveTier(fresh('basic'), neverLoads)).resolves.toBe('basic');
  });

  it.each(['free', 'max_15x', 'team', 'enterprise'] as const)(
    'preserves the canonical %s account tier instead of collapsing it to BYOK',
    async (tier) => {
      stubConfiguration();

      await expect(resolveTier(fresh(tier), neverLoads)).resolves.toBe(tier);
    },
  );

  it('keeps cross-provider switching locked without an account entitlement', async () => {
    stubConfiguration();
    const tier = await resolveTier(fresh(), neverLoads);

    expect(guardProviderSwitch(FIRST_PROVIDER_MODEL, SECOND_PROVIDER_MODEL, tier)).toBe(
      'upgrade-required',
    );
  });

  it('replaces a stale cached tier immediately after account sign-in', async () => {
    const context = makeContext('basic');
    const configUpdate = vi.fn();
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn(),
      inspect: vi.fn(),
      has: vi.fn().mockReturnValue(false),
      update: configUpdate,
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
    const loadTier = vi.fn().mockResolvedValue({ tier: 'team' });

    await expect(refreshAccountTierCache(context, loadTier)).resolves.toBe('team');
    expect(context.globalState.update).toHaveBeenCalledWith('tierStatus.cachedTier', 'team');
    expect(configUpdate).toHaveBeenCalledWith(
      'currentTier',
      'team',
      vscode.ConfigurationTarget.Global,
    );
  });

  it('clears paid-tier reachability immediately after account sign-out', async () => {
    const context = makeContext('enterprise');
    const configUpdate = vi.fn();
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn(),
      inspect: vi.fn(),
      has: vi.fn().mockReturnValue(false),
      update: configUpdate,
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);

    await clearAccountTierCache(context);

    expect(context.globalState.update).toHaveBeenCalledWith('tierStatus.cachedTier', undefined);
    expect(configUpdate).toHaveBeenCalledWith(
      'currentTier',
      'unknown',
      vscode.ConfigurationTarget.Global,
    );
  });

  it('fails closed instead of retaining a stale paid tier when refresh is unavailable', async () => {
    const context = makeContext('max');
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn(),
      inspect: vi.fn(),
      has: vi.fn().mockReturnValue(false),
      update: vi.fn(),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);

    await expect(
      refreshAccountTierCache(context, vi.fn().mockResolvedValue(undefined)),
    ).resolves.toBeUndefined();
    expect(context.globalState.update).toHaveBeenCalledWith('tierStatus.cachedTier', undefined);
  });
});
