import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { recordNotification } from './notification-service';

const DEVICES_SETTINGS_SECTION = 'account';

export async function notifyDeviceSignInApproved(
  db: DatabaseAdapter,
  input: { userId: string; deviceRef: string },
): Promise<void> {
  await recordNotification(db, {
    userId: input.userId,
    category: 'security',
    severity: 'warning',
    title: 'A new device signed in to your account',
    message:
      'You approved a device sign-in code. If this was not you, unlink the device and review your account security.',
    target: { kind: 'settings', id: DEVICES_SETTINGS_SECTION },
    dedupeKey: `device-sign-in:${input.deviceRef}`,
  });
}

export async function notifyDeviceDisconnected(
  db: DatabaseAdapter,
  input: { userId: string; deviceId: string; kind: string; name: string | null },
): Promise<void> {
  const label = input.name?.trim() || (input.kind === 'mobile' ? 'A phone' : 'A desktop app');
  await recordNotification(db, {
    userId: input.userId,
    category: 'device',
    severity: 'info',
    title: `${label} was disconnected`,
    message:
      'It is no longer linked to your account and has to sign in again before it can reach your chats, Work or files.',
    target: { kind: 'settings', id: DEVICES_SETTINGS_SECTION },
    dedupeKey: `device-disconnected:${input.deviceId}`,
  });
}
