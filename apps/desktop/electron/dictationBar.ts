import { BrowserWindow, screen, type WebPreferences } from 'electron';
import {
  DICTATION_BAR_ARGUMENT,
  ELECTRON_IPC_CHANNELS,
} from '../src/lib/tauri-electron/bridgeContract';
import { CLOUD_APP_ORIGIN, REMOTE_SESSION_PARTITION } from './config';
import type { DictationBar } from './dictationElsewhere';
import { applyRemoteWindowPolicy } from './windowPolicy';

export const DICTATION_BAR_PATH = '/quick-ask/dictate';
const BAR_WIDTH = 440;
const BAR_HEIGHT = 72;
const BAR_BOTTOM_GAP = 96;

let bridge: Pick<WebPreferences, 'preload' | 'additionalArguments'> = {};

export function configureDictationBarBridge(
  preferences: Pick<WebPreferences, 'preload' | 'additionalArguments'>,
): void {
  bridge = preferences;
}

/**
 * Where the bar sits: low and centred on the display under the pointer, clear
 * of the field the user is dictating into, which is usually higher up.
 */
export function dictationBarBounds(workArea: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.round(workArea.x + (workArea.width - BAR_WIDTH) / 2),
    y: Math.round(workArea.y + Math.max(0, workArea.height - BAR_HEIGHT - BAR_BOTTOM_GAP)),
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
  };
}

export function isDictationBarUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === new URL(CLOUD_APP_ORIGIN).origin && parsed.pathname === DICTATION_BAR_PATH
    );
  } catch {
    return false;
  }
}

/**
 * The bar never takes focus, so the app the user is dictating into stays the
 * key window and the text lands where their cursor already is.
 */
export function openDictationBar(onClosed: (contentsId: number) => void): DictationBar {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const win = new BrowserWindow({
    ...dictationBarBounds(display.workArea),
    show: false,
    frame: false,
    focusable: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    ...(process.platform === 'darwin'
      ? { type: 'panel' as const, vibrancy: 'hud' as const, roundedCorners: true }
      : {}),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      partition: REMOTE_SESSION_PARTITION,
      ...bridge,
      additionalArguments: [...(bridge.additionalArguments ?? []), DICTATION_BAR_ARGUMENT],
    },
  });
  const contentsId = win.webContents.id;
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  applyRemoteWindowPolicy(win);
  win.webContents.on('will-navigate', (event, url) => {
    if (!isDictationBarUrl(url)) event.preventDefault();
  });
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.showInactive();
  });
  win.on('closed', () => onClosed(contentsId));
  void win.loadURL(`${CLOUD_APP_ORIGIN}${DICTATION_BAR_PATH}`);

  return {
    contentsId,
    toggle() {
      if (!win.isDestroyed()) win.webContents.send(ELECTRON_IPC_CHANNELS.voiceHotkey);
    },
    close() {
      if (!win.isDestroyed()) win.destroy();
    },
  };
}
