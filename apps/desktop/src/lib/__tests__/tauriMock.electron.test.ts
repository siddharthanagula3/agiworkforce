import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The bundled Electron renderer stays browser-class except for its audited
 * Managed Cloud account bridge. This regression test guards both halves of
 * that boundary: account commands reach the preload shim, Local commands do
 * not acquire a native execution path.
 */
describe('tauri-mock Electron account bridge', () => {
  afterEach(() => {
    vi.doUnmock('../runtimeEnvironment');
    vi.doUnmock('../tauri-electron/bridgeContract');
    vi.resetModules();
  });

  it('routes only allowlisted account commands through the Electron core shim', async () => {
    vi.resetModules();
    vi.doMock('../runtimeEnvironment', () => ({
      isTauri: false,
      isElectronHost: true,
      isTestEnvironment: false,
      isDesktopUiDevLocal: false,
      supportsLocalAppMode: false,
      isCloudWeb: true,
    }));
    vi.doMock('../tauri-electron/bridgeContract', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../tauri-electron/bridgeContract')>()),
      getElectronHostBridge: () => ({ handles: () => true }),
    }));

    const core = await import('@tauri-apps/api/core');
    const bridgeInvoke = vi.mocked(core.invoke);
    bridgeInvoke.mockReset();
    bridgeInvoke.mockResolvedValue('stored');

    const { invoke } = await vi.importActual<typeof import('../tauri-mock')>('../tauri-mock');

    await expect(
      invoke('account_store_access_token', { accessToken: 'fixture-token' }),
    ).resolves.toBe('stored');
    expect(bridgeInvoke).toHaveBeenCalledWith('account_store_access_token', {
      accessToken: 'fixture-token',
    });

    bridgeInvoke.mockClear();
    await expect(invoke('agi_submit_goal', { goal: 'must remain unavailable' })).rejects.toThrow(
      'Agent execution requires the AGI Workforce desktop application',
    );
    expect(bridgeInvoke).not.toHaveBeenCalled();
  });
});
