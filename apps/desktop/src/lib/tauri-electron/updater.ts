/** Electron replacement for `@tauri-apps/plugin-updater`. */
import { getElectronHostBridge } from './bridgeContract';

export interface ElectronManualUpdate {
  available: boolean;
  currentVersion: string;
  version: string;
  body: string;
  date?: string;
  /** Opens the signed installer in the OS browser; it does not install in place. */
  downloadAndInstall?: () => Promise<void>;
}

/**
 * The Electron shell has a manual signed-installer flow. Keep the updater-like
 * shape so the existing settings UI can share its state machine with Tauri,
 * while the Electron-specific copy remains explicit about opening a DMG.
 */
export async function check(): Promise<ElectronManualUpdate> {
  const host = getElectronHostBridge();
  const currentVersion = host?.appVersion.trim() ?? '';
  if (!host || !currentVersion) {
    throw new Error('AGI Cloud could not determine the installed app version.');
  }
  const result = await host.checkForUpdate();

  return {
    available: result.available,
    currentVersion: result.currentVersion,
    version: result.version,
    body:
      'A newer signed and notarized AGI Cloud installer is available. ' +
      'Download the DMG, then replace the existing app in Applications.',
    ...(result.publishedAt ? { date: result.publishedAt } : {}),
    ...(result.available
      ? {
          downloadAndInstall: async () => {
            await host.openUpdateInstaller();
          },
        }
      : {}),
  };
}
