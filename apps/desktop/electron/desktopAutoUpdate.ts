import { app, autoUpdater } from 'electron';
import type { HostUpdateAvailability } from '@agiworkforce/local-runtime-contract';
import {
  compareDesktopCloudVersions,
  desktopCloudUpdateFeedUrl,
  type DesktopCloudMacArchitecture,
} from './desktopCloudUpdate';
import { recordDesktopEvent } from './runtime/desktopTelemetryService';

const AUTO_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60_000;

let started = false;
let feedConfigured = false;
let downloadedVersion: string | null = null;
let phase: NonNullable<HostUpdateAvailability['nativeUpdateState']> = 'idle';

export function autoUpdateSupported(): boolean {
  return app.isPackaged && process.platform === 'darwin';
}

export function checkForAutoUpdate(): void {
  if (!feedConfigured || phase === 'ready' || phase === 'checking' || phase === 'downloading')
    return;
  phase = 'checking';
  try {
    autoUpdater.checkForUpdates();
  } catch (error) {
    if (downloadedUpdate() === null) phase = 'failed';
    console.warn('[auto-update] the check could not start:', error);
  }
}

export function startAutoUpdate(
  architecture: DesktopCloudMacArchitecture,
  onReady: (version: string) => void,
): void {
  if (started || !autoUpdateSupported()) return;
  started = true;
  autoUpdater.on('checking-for-update', () => {
    if (phase !== 'ready' && phase !== 'downloading') phase = 'checking';
  });
  autoUpdater.on('update-available', () => {
    if (phase !== 'ready') phase = 'downloading';
  });
  autoUpdater.on('update-not-available', () => {
    if (phase !== 'ready') phase = 'idle';
  });
  autoUpdater.on('update-downloaded', (_event, _notes, releaseName) => {
    if (phase === 'ready') return;
    phase = 'ready';
    try {
      downloadedVersion =
        typeof releaseName === 'string' &&
        compareDesktopCloudVersions(releaseName, app.getVersion()) > 0
          ? releaseName.trim()
          : null;
    } catch {
      downloadedVersion = null;
    }
    recordDesktopEvent({ domain: 'updater', outcome: 'ok' });
    onReady(downloadedVersion ?? '');
  });
  autoUpdater.on('error', (error) => {
    if (phase !== 'ready') phase = 'failed';
    recordDesktopEvent({ domain: 'updater', outcome: 'failed', cause: 'network' });
    console.warn('[auto-update] the update could not be downloaded:', error);
  });
  try {
    autoUpdater.setFeedURL({ url: desktopCloudUpdateFeedUrl(architecture, app.getVersion()) });
    feedConfigured = true;
    checkForAutoUpdate();
  } catch (error) {
    phase = 'failed';
    console.warn('[auto-update] the update feed could not be configured:', error);
    return;
  }
  setInterval(checkForAutoUpdate, AUTO_UPDATE_CHECK_INTERVAL_MS).unref();
}

/** The last attempt to download an update failed, so the installer is the way to update. */
export function autoUpdateDownloadFailed(): boolean {
  return phase === 'failed';
}

export function downloadedUpdate(): string | null {
  return phase === 'ready' ? (downloadedVersion ?? '') : null;
}

export function autoUpdateState(): NonNullable<HostUpdateAvailability['nativeUpdateState']> {
  return autoUpdateSupported() ? phase : 'unsupported';
}

export function installDownloadedUpdate(): boolean {
  if (phase !== 'ready') return false;
  autoUpdater.quitAndInstall();
  return true;
}
