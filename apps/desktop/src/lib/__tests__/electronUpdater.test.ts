import { afterEach, describe, expect, it, vi } from 'vitest';
import { desktopCloudInstallerDownloadUrl } from '../desktopCloudUpdate';
import { check } from '../tauri-electron/updater';
import type { ElectronHostBridge } from '../tauri-electron/bridgeContract';

function installHost(openExternal: ElectronHostBridge['openExternal']): void {
  const host: ElectronHostBridge = {
    platform: 'electron-darwin',
    appVersion: '1.2.0',
    handles: () => false,
    invokeBridge: async () => undefined,
    // The updater under test never dispatches to the privileged runtime, so the
    // stub refuses rather than pretending a command succeeded.
    invokeRuntime: async () => ({
      ok: false as const,
      error: { code: 'unsupported-platform' as const, message: 'not available in this test host' },
    }),
    onDeepLink: () => () => undefined,
    onVoiceHotkey: () => () => undefined,
    openExternal,
    windowControl: async () => false,
    dialog: async () => null,
    notify: async () => undefined,
    relaunch: async () => undefined,
    checkForUpdate: async () => ({
      available: true,
      currentVersion: '1.2.0',
      version: '1.3.0',
      publishedAt: '2026-08-13T00:00:00.000Z',
      downloadUrl: desktopCloudInstallerDownloadUrl('arm64'),
    }),
    openUpdateInstaller: async () => {
      await openExternal(desktopCloudInstallerDownloadUrl('arm64'));
    },
  };
  window.agiHost = host;
}

afterEach(() => {
  delete window.agiHost;
  vi.unstubAllGlobals();
});

describe('Electron manual updater shim', () => {
  it('opens the canonical signed installer rather than claiming an in-place update', async () => {
    const openExternal = vi.fn(async () => undefined);
    installHost(openExternal);
    const update = await check();
    expect(update).toMatchObject({ available: true, currentVersion: '1.2.0', version: '1.3.0' });
    expect(update.body).toMatch(/signed and notarized/i);
    await update.downloadAndInstall?.();
    expect(openExternal).toHaveBeenCalledWith(desktopCloudInstallerDownloadUrl('arm64'));
  });

  it('fails honestly when the packaged app version bridge is unavailable', async () => {
    await expect(check()).rejects.toThrow(/determine the installed app version/i);
  });
});
