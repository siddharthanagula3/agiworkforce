/**
 * Window API — typed wrappers for window_* and tray_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export type DockPosition = 'left' | 'right' | 'top' | 'bottom';

export interface WindowStatePayload {
  pinned: boolean;
  alwaysOnTop: boolean;
  dock?: DockPosition;
  maximized: boolean;
  fullscreen: boolean;
}

// ---- Window Commands ----

export async function windowGetState(): Promise<WindowStatePayload> {
  return command<WindowStatePayload>('window_get_state');
}

export async function windowSetPinned(pinned: boolean): Promise<void> {
  return command<void>('window_set_pinned', { pinned });
}

export async function windowSetAlwaysOnTop(value: boolean): Promise<void> {
  return command<void>('window_set_always_on_top', { value });
}

export async function windowSetVisibility(visible: boolean): Promise<void> {
  return command<void>('window_set_visibility', { visible });
}

export async function windowDock(position?: DockPosition): Promise<void> {
  return command<void>('window_dock', { position });
}

export async function windowIsMaximized(): Promise<boolean> {
  return command<boolean>('window_is_maximized');
}

export async function windowMaximize(): Promise<void> {
  return command<void>('window_maximize');
}

export async function windowUnmaximize(): Promise<void> {
  return command<void>('window_unmaximize');
}

export async function windowToggleMaximize(): Promise<void> {
  return command<void>('window_toggle_maximize');
}

export async function windowSetFullscreen(fullscreen: boolean): Promise<void> {
  return command<void>('window_set_fullscreen', { fullscreen });
}

export async function windowIsFullscreen(): Promise<boolean> {
  return command<boolean>('window_is_fullscreen');
}

export async function windowToggleFloating(): Promise<boolean> {
  return command<boolean>('window_toggle_floating');
}

export async function windowOpenFloating(): Promise<void> {
  return command<void>('window_open_floating');
}

export async function windowCloseFloating(): Promise<void> {
  return command<void>('window_close_floating');
}

export async function windowIsFloatingVisible(): Promise<boolean> {
  return command<boolean>('window_is_floating_visible');
}

// ---- Tray Commands ----

export async function traySetUnreadBadge(count: number): Promise<void> {
  return command<void>('tray_set_unread_badge', { count });
}
