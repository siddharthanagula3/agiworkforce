import { app, autoUpdater } from 'electron';
import { desktopCloudUpdateFeedUrl, type DesktopCloudMacArchitecture } from './desktopCloudUpdate';
import { recordDesktopEvent } from './runtime/desktopTelemetryService';

const AUTO_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60_000;

let started = false;
let downloadedVersion: string | null = null;

export function autoUpdateSupported(): boolean {
  return app.isPackaged && process.platform === 'darwin';
}

export function checkForAutoUpdate(): void {
  if (!started || downloadedVersion !== null) return;
  try {
    autoUpdater.checkForUpdates();
  } catch (error) {
    console.warn('[auto-update] the check could not start:', error);
  }
}

export function startAutoUpdate(
  architecture: DesktopCloudMacArchitecture,
  onReady: (version: string) => void,
): void {
  if (started || !autoUpdateSupported()) return;
  started = true;
  autoUpdater.setFeedURL({ url: desktopCloudUpdateFeedUrl(architecture, app.getVersion()) });
  autoUpdater.on('update-downloaded', (_event, _notes, releaseName) => {
    downloadedVersion = releaseName || app.getVersion();
    recordDesktopEvent({ domain: 'updater', outcome: 'ok' });
    onReady(downloadedVersion);
  });
  autoUpdater.on('error', (error) => {
    recordDesktopEvent({ domain: 'updater', outcome: 'failed', cause: 'network' });
    console.warn('[auto-update] the update could not be downloaded:', error);
  });
  checkForAutoUpdate();
  setInterval(checkForAutoUpdate, AUTO_UPDATE_CHECK_INTERVAL_MS).unref();
}

export function downloadedUpdate(): string | null {
  return downloadedVersion;
}

export function installDownloadedUpdate(): boolean {
  if (downloadedVersion === null) return false;
  autoUpdater.quitAndInstall();
  return true;
}
