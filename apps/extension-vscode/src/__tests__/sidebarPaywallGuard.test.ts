
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

function makeContext(cachedTier?: string): vscode.ExtensionContext {
  return {
    globalState: {
      get: (key: string) => (key === 'tierStatus.cachedTier' ? cachedTier : undefined),
      update: vi.fn(),
      keys: () => [],
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

    await expect(resolveTier(makeContext())).resolves.toBe('byok');
  });

  it('uses the cached account tier', async () => {
    stubConfiguration();

    await expect(resolveTier(makeContext('basic'))).resolves.toBe('basic');
  });

  it.each(['free', 'max_15x', 'team', 'enterprise'] as const)(
    'preserves the canonical %s account tier instead of collapsing it to BYOK',
    async (tier) => {
      stubConfiguration();

      await expect(resolveTier(makeContext(tier))).resolves.toBe(tier);
    },
  );

  it('keeps cross-provider switching locked without an account entitlement', async () => {
    stubConfiguration();
    const tier = await resolveTier(makeContext());

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
