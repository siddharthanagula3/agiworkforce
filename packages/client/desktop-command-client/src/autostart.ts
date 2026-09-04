import { command } from '@agiworkforce/client-runtime';

export async function autostartGetEnabled(): Promise<boolean> {
  return command<boolean>('autostart_get_enabled');
}

export async function autostartSetEnabled(enabled: boolean): Promise<void> {
  return command<void>('autostart_set_enabled', { enabled });
}
