import { afterEach, describe, expect, it, vi } from 'vitest';
import { desktopCloudInstallerDownloadUrl } from '../desktopCloudUpdate';
import { check } from '../tauri-electron/updater';
import type { ElectronHostBridge } from '../tauri-electron/bridgeContract';

function installHost(openExternal: ElectronHostBridge['openExternal']): void {
  window.agiHost = {
    platform: 'electron-darwin',
    appVersion: '1.2.0',
    handles: () => false,
    invokeBridge: async () => undefined,
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
