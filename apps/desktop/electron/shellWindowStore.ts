import { app } from 'electron';
import path from 'node:path';
import {
  normalizeSecondaryPanelWidth,
  readWindowState,
  writeWindowState,
  type ShellWindowState,
} from './windowState';

export interface ShellLayout {
  secondaryPanelWidth: number | null;
  sidebarCollapsed: boolean | null;
}

export function windowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

export function readShellWindowState(): ShellWindowState {
  return readWindowState(windowStatePath());
}

export function patchShellWindowState(patch: Partial<ShellWindowState>): ShellWindowState {
  const next = { ...readShellWindowState(), ...patch };
  writeWindowState(windowStatePath(), next);
  return next;
}

export function readShellLayout(): ShellLayout {
  const state = readShellWindowState();
  return {
    secondaryPanelWidth: state.secondaryPanelWidth,
    sidebarCollapsed: state.sidebarCollapsed,
  };
}

/**
 * The shell owns the layout, not one window, so a second window opens on what
 * the first one left and a relaunch does not start from the default again.
 */
export function writeShellLayout(patch: Record<string, unknown>): ShellLayout {
  const next: Partial<ShellWindowState> = {};
  if ('secondaryPanelWidth' in patch) {
    next.secondaryPanelWidth = normalizeSecondaryPanelWidth(patch['secondaryPanelWidth']);
  }
  if (typeof patch['sidebarCollapsed'] === 'boolean') {
    next.sidebarCollapsed = patch['sidebarCollapsed'];
  }
  const state = patchShellWindowState(next);
  return {
    secondaryPanelWidth: state.secondaryPanelWidth,
    sidebarCollapsed: state.sidebarCollapsed,
  };
}
