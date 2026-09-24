import { app } from 'electron';
import { DESKTOP_CLOUD_RELEASE_CHANNEL } from '../desktopCloudUpdate';
import {
  createDesktopTelemetry,
  createTelemetryLogWriter,
  type DesktopDiagnostics,
  type DesktopRelease,
  type DesktopTelemetry,
  type DesktopTelemetryEvent,
} from './desktopTelemetry';

const DEVELOPMENT_CHANNEL = 'development';
const UNKNOWN_VERSION = '0.0.0';

let telemetry: DesktopTelemetry | null = null;

export function desktopRelease(): DesktopRelease {
  return {
    version: app?.getVersion?.() ?? UNKNOWN_VERSION,
    channel: app?.isPackaged ? DESKTOP_CLOUD_RELEASE_CHANNEL : DEVELOPMENT_CHANNEL,
    platform: process.platform,
    arch: process.arch,
  };
}

/**
 * The record must never be the reason something else failed, so a shell running
 * outside Electron, or one that cannot write its log, counts in memory only.
 */
function instance(): DesktopTelemetry {
  if (telemetry) return telemetry;
  let write: ((line: string) => void) | undefined;
  try {
    write = createTelemetryLogWriter(app.getPath('logs'));
  } catch {
    write = undefined;
  }
  telemetry = createDesktopTelemetry({
    release: desktopRelease(),
    ...(write ? { write } : {}),
  });
  return telemetry;
}

/** Every shell service records through this, so one file holds the whole run. */
export function recordDesktopEvent(event: DesktopTelemetryEvent): void {
  try {
    instance().record(event);
  } catch {
    telemetry = null;
  }
}

export function desktopDiagnostics(): DesktopDiagnostics {
  return instance().diagnostics();
}

export function resetDesktopTelemetry(): void {
  telemetry = null;
}
