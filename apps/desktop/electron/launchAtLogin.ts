import { app } from 'electron';
import { getPreferences, saveSettings } from './settingsStore';

/**
 * Opt-in launch at login.
 *
 * The stored preference is the authority, not whatever the OS currently
 * reports: a user who disabled the login item through System Settings should
 * not have the app quietly re-add it on next launch, so state is pushed to the
 * OS only when the stored preference says it should be on.
 */
export function isLaunchAtLoginEnabled(): boolean {
  return getPreferences().launchAtLogin;
}

export function applyLaunchAtLogin(): void {
  if (!isLaunchAtLoginEnabled()) return;
  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
}

export function setLaunchAtLogin(enabled: boolean): boolean {
  saveSettings({ launchAtLogin: enabled });
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: enabled });
  return enabled;
}

export function toggleLaunchAtLogin(): boolean {
  return setLaunchAtLogin(!isLaunchAtLoginEnabled());
}
