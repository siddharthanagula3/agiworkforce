import { getElectronHostBridge } from './bridgeContract';

export interface ElectronManualUpdate {
  available: boolean;
  currentVersion: string;
  version: string;
  body: string;
  date?: string;
  downloadAndInstall?: () => Promise<void>;
}

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
