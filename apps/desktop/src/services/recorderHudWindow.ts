import { shortcuts } from '@agiworkforce/desktop-command-client';

import { waitForOwnedWebviewWindow } from './ownedWebviewWindow';

export const RECORDER_HUD_WINDOW_LABEL = 'recorder-hud';
export const RECORDER_STOP_SHORTCUT = 'CommandOrControl+Shift+.';
export const RECORDER_STOP_SHORTCUT_ACTION = 'stop_recorder';

const HUD_WIDTH = 640;
const HUD_HEIGHT = 88;

async function getHudPosition(): Promise<{ x?: number; y?: number }> {
  const { currentMonitor } = await import('@tauri-apps/api/window');
  const monitor = await currentMonitor().catch(() => null);
  if (!monitor) return {};

  const scale = monitor.scaleFactor || 1;
  const workX = monitor.workArea.position.x / scale;
  const workY = monitor.workArea.position.y / scale;
  const workWidth = monitor.workArea.size.width / scale;
  return {
    x: Math.round(workX + (workWidth - HUD_WIDTH) / 2),
    y: Math.round(workY + 16),
  };
}

/**
 * Opens the recorder-only always-on-top window and reserves its stop shortcut.
 * A failed HUD/shortcut setup aborts capture so recording never continues
 * without visible controls.
 */
export async function openRecorderHudWindow(): Promise<void> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const existing = await WebviewWindow.getByLabel(RECORDER_HUD_WINDOW_LABEL);
  if (existing) {
    await existing.close().catch(() => undefined);
  }

  const position = await getHudPosition();
  const hudWindow = new WebviewWindow(RECORDER_HUD_WINDOW_LABEL, {
    url: 'index.html?mode=recorder-hud',
    title: 'Workflow capture',
    ...position,
    width: HUD_WIDTH,
    height: HUD_HEIGHT,
    minWidth: HUD_WIDTH,
    minHeight: HUD_HEIGHT,
    maxWidth: HUD_WIDTH,
    maxHeight: HUD_HEIGHT,
    resizable: false,
    maximizable: false,
    minimizable: false,
    closable: false,
    decorations: false,
    transparent: true,
    shadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focus: false,
    focusable: true,
    visible: true,
  });

  try {
    await waitForOwnedWebviewWindow(hudWindow, 'Could not open the recording controls');
    await shortcuts.shortcutsRegisterGlobal(RECORDER_STOP_SHORTCUT, RECORDER_STOP_SHORTCUT_ACTION);
  } catch (error) {
    await hudWindow.close().catch(() => undefined);
    throw error;
  }
}

export async function closeRecorderHudWindow(): Promise<void> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  await shortcuts.shortcutsUnregisterGlobal(RECORDER_STOP_SHORTCUT).catch(() => undefined);
  const hudWindow = await WebviewWindow.getByLabel(RECORDER_HUD_WINDOW_LABEL);
  if (hudWindow) await hudWindow.close().catch(() => undefined);
}

/** Called inside the HUD webview after Done/Discard succeeds. */
export async function closeCurrentRecorderHud(): Promise<void> {
  await shortcuts.shortcutsUnregisterGlobal(RECORDER_STOP_SHORTCUT).catch(() => undefined);
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow()
    .close()
    .catch(() => undefined);
}
