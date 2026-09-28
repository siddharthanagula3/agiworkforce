import {
  Notification,
  app,
  globalShortcut,
  powerMonitor,
  screen,
  type BrowserWindow,
} from 'electron';
import {
  COMPUTER_USE_STOP_SHORTCUT,
  NO_HOST_SHORTCUT,
  describeAccelerator,
  deviceStepCommand,
  type ComputerUsePauseCause,
  type ComputerUsePhase,
  type ComputerUseStatus,
  type PermissionScope,
} from '@agiworkforce/local-runtime-contract';
import { getPreferences, saveSettings } from '../settingsStore';
import {
  ComputerUseRefused,
  computerUseSupport,
  forgetLastFrame,
  stopComputerUseHelper,
} from './computerUseService';
import { recordDesktopEvent } from './desktopTelemetryService';
import { getPermissionState, revokePermission } from './permissionManager';
import { listForAccessibility, systemPermissionStatus } from './systemPermissions';

const GLOBAL_SCOPE: PermissionScope = { kind: 'global' };
const INPUT_WATCH_INTERVAL_MS = 250;
const SYNTHETIC_INPUT_SETTLE_MS = 1_500;
const IDLE_CLOCK_RESOLUTION_MS = 1_000;
const CURSOR_TOLERANCE = 3;
const QUIET_RUN_LIMIT_MS = 2 * 60_000;
const HELD_STEP_LIMIT_MS = 10 * 60_000;
const APP_SWITCH_SETTLE_MS = 250;

const OBSERVING_COMMANDS: ReadonlySet<string> = new Set(
  (['device_screenshot', 'device_zoom', 'device_wait'] as const).map(deviceStepCommand),
);

const STOPPED_MESSAGE =
  'The user stopped computer use. Do not try another screen step in this reply; tell them where you got to and what is left.';
const RESUMED_MESSAGE =
  'The user handed control back after using the computer themselves, so the screen may have changed and this step did not run. Take a fresh screenshot and carry on from what it shows.';
const EXPIRED_MESSAGE =
  'The user has taken over the screen and has not handed it back, so this step did not run. Tell them what you were about to do and ask them to hand control back.';
const FINISHED_MESSAGE = 'This reply ended while the user had the screen, so the step did not run.';
const DISABLED_MESSAGE =
  'Computer use is turned off in AGI Cloud settings, so this step did not run. Tell the user they can turn it on under Settings, Desktop app.';

type HeldOutcome = 'resume' | 'stopped' | 'finished' | 'expired';

export interface ComputerUseHooks {
  onChange: () => void;
  onNotificationClick: () => void;
}

let hooks: ComputerUseHooks = { onChange: () => undefined, onNotificationClick: () => undefined };
let phase: ComputerUsePhase = 'idle';
let pausedBy: ComputerUsePauseCause | null = null;
let stopped = false;
let driver: BrowserWindow | null = null;
let stopShortcutHeld = false;
let quietTimer: ReturnType<typeof setTimeout> | null = null;
let inputWatch: ReturnType<typeof setInterval> | null = null;
let busy = 0;
let lastSyntheticInputAt = 0;
let cursorBaseline: Electron.Point | null = null;
const held = new Set<(outcome: HeldOutcome) => void>();

export function configureComputerUse(next: ComputerUseHooks): void {
  hooks = next;
}

function stopKeyLabel(): string {
  return describeAccelerator(COMPUTER_USE_STOP_SHORTCUT, process.platform);
}

export function computerUseStatus(): ComputerUseStatus {
  const support = computerUseSupport();
  return {
    enabled: getPreferences().computerUseEnabled,
    available: support.supported,
    unavailableReason: support.supported ? null : support.reason,
    grant: getPermissionState('computer.use', GLOBAL_SCOPE),
    phase,
    pausedBy,
    stopShortcut:
      phase !== 'active' || stopShortcutHeld ? COMPUTER_USE_STOP_SHORTCUT : NO_HOST_SHORTCUT,
    system: {
      accessibility: systemPermissionStatus('accessibility'),
      screenRecording: systemPermissionStatus('screen-recording'),
    },
  };
}

export function computerUseEnabled(): boolean {
  return getPreferences().computerUseEnabled;
}

export function computerUsePhase(): ComputerUsePhase {
  return phase;
}

function announce(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body });
  notification.on('click', () => hooks.onNotificationClick());
  notification.show();
}

function claimStopShortcut(): void {
  if (stopShortcutHeld) return;
  try {
    stopShortcutHeld = globalShortcut.register(COMPUTER_USE_STOP_SHORTCUT, () => {
      stopComputerUse();
    });
  } catch {
    stopShortcutHeld = false;
  }
}

function releaseStopShortcut(): void {
  if (!stopShortcutHeld) return;
  globalShortcut.unregister(COMPUTER_USE_STOP_SHORTCUT);
  stopShortcutHeld = false;
}

function stopWatchingInput(): void {
  if (inputWatch) clearInterval(inputWatch);
  inputWatch = null;
  cursorBaseline = null;
}

function watchForUserInput(): void {
  if (phase !== 'active' || busy > 0) return;
  const quietFor = Date.now() - lastSyntheticInputAt;
  if (quietFor < SYNTHETIC_INPUT_SETTLE_MS) {
    cursorBaseline = null;
    return;
  }
  const cursor = screen.getCursorScreenPoint();
  if (!cursorBaseline) {
    cursorBaseline = cursor;
    return;
  }
  const moved =
    Math.abs(cursor.x - cursorBaseline.x) > CURSOR_TOLERANCE ||
    Math.abs(cursor.y - cursorBaseline.y) > CURSOR_TOLERANCE;
  const touched =
    quietFor >= SYNTHETIC_INPUT_SETTLE_MS + IDLE_CLOCK_RESOLUTION_MS &&
    powerMonitor.getSystemIdleTime() === 0;
  if (moved || touched) pause('user-input');
}

function touchQuietTimer(): void {
  if (quietTimer) clearTimeout(quietTimer);
  quietTimer = setTimeout(() => {
    quietTimer = null;
    if (held.size > 0) touchQuietTimer();
    else endRun('finished');
  }, QUIET_RUN_LIMIT_MS);
  quietTimer.unref?.();
}

function settleHeld(outcome: HeldOutcome): void {
  for (const settle of [...held]) settle(outcome);
}

function holdUntilHandedBack(): Promise<HeldOutcome> {
  return new Promise((resolve) => {
    const settle = (outcome: HeldOutcome) => {
      clearTimeout(timer);
      held.delete(settle);
      resolve(outcome);
    };
    const timer = setTimeout(() => settle('expired'), HELD_STEP_LIMIT_MS);
    held.add(settle);
  });
}

function onDriverClosed(): void {
  driver = null;
  endRun('finished');
}

function beginRun(window: BrowserWindow | null): void {
  phase = 'active';
  pausedBy = null;
  driver = window && !window.isDestroyed() ? window : null;
  driver?.once('closed', onDriverClosed);
  lastSyntheticInputAt = Date.now();
  cursorBaseline = null;
  claimStopShortcut();
  inputWatch = setInterval(watchForUserInput, INPUT_WATCH_INTERVAL_MS);
  inputWatch.unref?.();
  recordDesktopEvent({ domain: 'desktop_control', outcome: 'started' });
  announce(
    'AGI is using your computer',
    stopShortcutHeld
      ? `Press ${stopKeyLabel()} to stop it.`
      : 'Stop it from the AGI Cloud window or its File menu.',
  );
  hooks.onChange();
}

function endRun(reason: 'finished' | 'stopped'): void {
  const wasRunning = phase !== 'idle';
  if (quietTimer) clearTimeout(quietTimer);
  quietTimer = null;
  releaseStopShortcut();
  stopWatchingInput();
  stopComputerUseHelper();
  settleHeld(reason);
  phase = 'idle';
  pausedBy = null;
  stopped = reason === 'stopped';
  if (stopped) {
    touchQuietTimer();
  } else {
    driver?.removeListener('closed', onDriverClosed);
    driver = null;
  }
  if (wasRunning && reason === 'finished') {
    recordDesktopEvent({ domain: 'desktop_control', outcome: 'ok' });
    announce('AGI finished using your computer', 'Your screen is yours again.');
  }
  hooks.onChange();
}

function pause(cause: ComputerUsePauseCause): void {
  if (phase !== 'active') return;
  phase = 'paused';
  pausedBy = cause;
  releaseStopShortcut();
  if (cause === 'user-input') {
    announce(
      'AGI paused',
      'You used the mouse or keyboard, so it stopped where it was. Hand back control in AGI Cloud when you want it to carry on.',
    );
  }
  hooks.onChange();
}

export function refuseScreenStepEarly(): void {
  if (!computerUseEnabled()) throw new ComputerUseRefused('permission', DISABLED_MESSAGE);
  if (stopped) {
    touchQuietTimer();
    throw new ComputerUseRefused('paused', STOPPED_MESSAGE);
  }
}

async function awaitHandBack(command: string): Promise<void> {
  const outcome = await holdUntilHandedBack();
  touchQuietTimer();
  if (outcome === 'stopped') throw new ComputerUseRefused('paused', STOPPED_MESSAGE);
  if (outcome === 'finished') throw new ComputerUseRefused('paused', FINISHED_MESSAGE);
  if (outcome === 'expired') throw new ComputerUseRefused('paused', EXPIRED_MESSAGE);
  if (!OBSERVING_COMMANDS.has(command)) throw new ComputerUseRefused('paused', RESUMED_MESSAGE);
}

export async function enterScreenStep(
  window: BrowserWindow | null,
  command: string,
): Promise<void> {
  refuseScreenStepEarly();
  touchQuietTimer();
  if (phase === 'paused') return awaitHandBack(command);
  if (phase === 'idle') beginRun(window);
}

export async function confirmScreenStepStillWanted(command: string): Promise<void> {
  if (stopped) throw new ComputerUseRefused('paused', STOPPED_MESSAGE);
  if (phase === 'idle') throw new ComputerUseRefused('paused', FINISHED_MESSAGE);
  if (phase === 'paused') await awaitHandBack(command);
}

export async function withoutInputWatch<T>(
  action: () => Promise<T>,
  options: { releaseStopShortcut?: boolean } = {},
): Promise<T> {
  busy += 1;
  const released = options.releaseStopShortcut === true && stopShortcutHeld;
  if (released) releaseStopShortcut();
  try {
    return await action();
  } finally {
    busy -= 1;
    lastSyntheticInputAt = Date.now();
    cursorBaseline = null;
    if (released && phase === 'active') claimStopShortcut();
  }
}

export async function askUserDuringRun<T>(
  window: BrowserWindow | null,
  ask: () => Promise<T>,
): Promise<T> {
  const target = window && !window.isDestroyed() ? window : null;
  const broughtForward = target !== null && !target.isFocused();
  if (target && broughtForward) {
    if (target.isMinimized()) target.restore();
    target.show();
    app.focus({ steal: true });
  }
  try {
    return await withoutInputWatch(ask, { releaseStopShortcut: true });
  } finally {
    if (broughtForward && process.platform === 'darwin') {
      app.hide();
      await new Promise((resolve) => setTimeout(resolve, APP_SWITCH_SETTLE_MS));
    }
  }
}

export function stopComputerUse(): ComputerUseStatus {
  revokePermission('computer.use', GLOBAL_SCOPE);
  stopComputerUseHelper();
  recordDesktopEvent({ domain: 'desktop_control', outcome: 'refused', cause: 'cancelled' });
  if (phase !== 'idle') endRun('stopped');
  else hooks.onChange();
  return computerUseStatus();
}

export function takeOverComputerUse(): ComputerUseStatus {
  if (phase === 'active') {
    stopComputerUseHelper();
    pause('taken-over');
  } else if (phase === 'paused') {
    pausedBy = 'taken-over';
    hooks.onChange();
  }
  return computerUseStatus();
}

export function handBackComputerUse(): ComputerUseStatus {
  if (phase !== 'paused') return computerUseStatus();
  phase = 'active';
  pausedBy = null;
  forgetLastFrame();
  lastSyntheticInputAt = Date.now();
  cursorBaseline = null;
  claimStopShortcut();
  settleHeld('resume');
  hooks.onChange();
  return computerUseStatus();
}

export function finishComputerUse(window: BrowserWindow | null): ComputerUseStatus {
  if (driver && window && driver !== window) return computerUseStatus();
  if (phase !== 'idle' || stopped) endRun('finished');
  return computerUseStatus();
}

export function setComputerUseEnabled(enabled: boolean): ComputerUseStatus {
  saveSettings({ computerUseEnabled: enabled });
  if (enabled) {
    listForAccessibility();
    hooks.onChange();
    return computerUseStatus();
  }
  return stopComputerUse();
}

export function shutDownComputerUse(): void {
  releaseStopShortcut();
  stopWatchingInput();
  stopComputerUseHelper();
}
