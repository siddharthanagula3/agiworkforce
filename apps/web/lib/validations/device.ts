import { z } from 'zod';

// device_authorization_codes.user_code is globally unique across both pairing flows
// (0029_device_authorization_contract.sql), so these two formats must stay disjoint:
// the format is the only discriminator telling an RFC 8628 row from a QR-link row.
export const CLI_USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CLI_USER_CODE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;
export const QR_LINK_CODE_BYTES = 8;
export const QR_LINK_CODE_PATTERN = new RegExp(`^[A-F0-9]{${QR_LINK_CODE_BYTES * 2}}$`);

export type DevicePairingFlow = 'cli' | 'qr';

export function devicePairingFlow(userCode: unknown): DevicePairingFlow | null {
  if (typeof userCode !== 'string') return null;
  const normalized = userCode.trim().toUpperCase();
  if (CLI_USER_CODE_PATTERN.test(normalized)) return 'cli';
  if (QR_LINK_CODE_PATTERN.test(normalized)) return 'qr';
  return null;
}

export const CliUserCodeSchema = z
  .string()
  .min(1, 'user_code is required')
  .max(16, 'user_code is too long')
  .transform((value) => value.trim().toUpperCase())
  .refine((value) => CLI_USER_CODE_PATTERN.test(value), 'Invalid user code format');
