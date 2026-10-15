import { command } from '@agiworkforce/client-runtime';

export type DockPosition = 'left' | 'right' | 'top' | 'bottom';

export interface WindowStatePayload {
  pinned: boolean;
  alwaysOnTop: boolean;
  keepInMenuBar: boolean;
  dock?: DockPosition;
  maximized: boolean;
  fullscreen: boolean;
}

export async function windowGetState(): Promise<WindowStatePayload> {
  return command<WindowStatePayload>('window_get_state');
}

export async function windowSetMenuBarMode(enabled: boolean): Promise<void> {
  return command<void>('window_set_menu_bar_mode', { enabled });
}
