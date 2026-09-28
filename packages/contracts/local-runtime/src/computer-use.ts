import type { PermissionState } from './capabilities';
import type { SystemPermissionStatus } from './desktop-privacy';

export const COMPUTER_USE_PHASES = ['idle', 'active', 'paused'] as const;

export type ComputerUsePhase = (typeof COMPUTER_USE_PHASES)[number];

export type ComputerUsePauseCause = 'taken-over' | 'user-input';

export interface ComputerUseStatus {
  enabled: boolean;
  available: boolean;
  unavailableReason: string | null;
  grant: PermissionState;
  phase: ComputerUsePhase;
  pausedBy: ComputerUsePauseCause | null;
  stopShortcut: string;
  system: {
    accessibility: SystemPermissionStatus;
    screenRecording: SystemPermissionStatus;
  };
}

export const COMPUTER_USE_STOP_SHORTCUT = 'Escape';

export interface DeviceFrontWindow {
  app: string;
  bundleId: string | null;
  window: string | null;
}

const MAX_FRONT_WINDOW_TITLE = 120;

export function readDeviceFrontWindow(value: unknown): DeviceFrontWindow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const app = typeof record['app'] === 'string' ? record['app'].trim() : '';
  if (app === '') return null;
  const title = typeof record['window'] === 'string' ? record['window'].trim() : '';
  return {
    app: app.slice(0, MAX_FRONT_WINDOW_TITLE),
    bundleId: typeof record['bundleId'] === 'string' ? record['bundleId'] : null,
    window: title === '' ? null : title.slice(0, MAX_FRONT_WINDOW_TITLE),
  };
}

export function describeDeviceFrontWindow(front: DeviceFrontWindow): string {
  return front.window ? `${front.app}, window "${front.window}"` : front.app;
}

const INPUT_REFUSING_APPS: Readonly<Record<string, string>> = {
  'com.apple.SecurityAgent': 'a macOS password prompt',
  'com.apple.LocalAuthentication.UIAgent': 'a macOS Touch ID or password prompt',
  'com.apple.tcc.AuthorizationPromptService': 'a macOS privacy prompt',
  'com.apple.loginwindow': 'the macOS login and lock screen',
};

export function deviceFrontWindowRefusal(front: DeviceFrontWindow): string | null {
  const kind = front.bundleId ? INPUT_REFUSING_APPS[front.bundleId] : undefined;
  if (!kind) return null;
  return `${front.app} is ${kind}. macOS ignores clicks and typing that other apps send to it, so no screen step can answer it: ask the user to answer it themselves, then take a screenshot.`;
}
