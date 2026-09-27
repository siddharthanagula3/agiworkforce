import { z } from 'zod';
import type { PairTokenRole } from './pair-token.js';

export const deviceIdSchema = z.guid();

const PAIRING_DEVICE_KEYS: Readonly<Record<PairTokenRole, string>> = Object.freeze({
  desktop: 'desktopDeviceId',
  mobile: 'mobileDeviceId',
});

const PAIRING_ROLES: readonly PairTokenRole[] = ['desktop', 'mobile'];

export function pairingDeviceKey(role: PairTokenRole): string {
  return PAIRING_DEVICE_KEYS[role];
}

export function pairingDeviceId(
  metadata: Record<string, unknown> | null | undefined,
  role: PairTokenRole,
): string | null {
  const value = metadata?.[PAIRING_DEVICE_KEYS[role]];
  return deviceIdSchema.safeParse(value).success ? (value as string) : null;
}

export function pairingDeviceIds(metadata: Record<string, unknown> | null | undefined): string[] {
  return PAIRING_ROLES.map((role) => pairingDeviceId(metadata, role)).filter(
    (deviceId): deviceId is string => deviceId !== null,
  );
}

export function withPairingDevice(
  metadata: Record<string, unknown> | null | undefined,
  role: PairTokenRole,
  deviceId: string,
): Record<string, unknown> {
  return { ...(metadata ?? {}), [PAIRING_DEVICE_KEYS[role]]: deviceId };
}
