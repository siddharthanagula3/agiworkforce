import { app } from 'electron';
import { getPreferences, saveSettingsDurably } from './settingsStore';

/**
 * Opt-in launch at login.
 *
 * The login item lives in the system, and a person can remove it in System
 * Settings without opening this app, so the system's answer is what the app
 * reports and the stored choice follows it. Re-adding the item on the next
 * launch would overrule a choice the person made outside the app.
 */
export function isLaunchAtLoginEnabled(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}

export function syncLaunchAtLogin(): void {
  const enabled = isLaunchAtLoginEnabled();
  if (getPreferences().launchAtLogin !== enabled) saveSettings({ launchAtLogin: enabled });
}

/** Answers what the system now holds, which differs from the request when it refused. */
export function setLaunchAtLogin(enabled: boolean): boolean {
  saveSettingsDurably({ launchAtLogin: enabled });
  app.setLoginItemSettings({ openAtLogin: enabled });
  const applied = isLaunchAtLoginEnabled();
  saveSettings({ launchAtLogin: applied });
  return applied;
}
