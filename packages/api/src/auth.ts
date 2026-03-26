/**
 * Auth API — typed wrappers for auth_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Commands ----

export async function authStoreSession(session: string): Promise<void> {
  return command<void>('auth_store_session', { session });
}

export async function authRetrieveSession(): Promise<string> {
  return command<string>('auth_retrieve_session');
}

export async function authRemoveSession(): Promise<void> {
  return command<void>('auth_remove_session');
}

// ---- Account / Device Management ----

export interface ConnectedDevice {
  id: string;
  name: string;
  type: 'desktop' | 'mobile' | 'extension' | 'web';
  platform: string;
  lastSeen: string;
  current: boolean;
}

export async function accountListDevices(): Promise<ConnectedDevice[]> {
  return command<ConnectedDevice[]>('account_list_devices');
}

export async function accountDisconnectDevice(deviceId: string): Promise<void> {
  return command<void>('account_disconnect_device', { deviceId });
}
