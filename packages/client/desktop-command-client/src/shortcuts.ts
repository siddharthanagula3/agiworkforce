import { command } from '@agiworkforce/client-runtime';

export async function shortcutsRegisterGlobal(key: string, action: string): Promise<void> {
  return command<void>('shortcuts_register_global', { key, action });
}

export async function shortcutsUnregisterGlobal(key: string): Promise<void> {
  return command<void>('shortcuts_unregister_global', { key });
}
