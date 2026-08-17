import { z } from 'zod';

export const DeviceIdSchema = z
  .string()
  .min(1, 'device_id is required')
  .max(128, 'device_id must be 128 characters or less')
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    'device_id contains invalid characters. Only alphanumeric, dashes, underscores, and dots are allowed.',
  );

export const DeviceNameSchema = z
  .string()
  .max(200, 'device_name must be 200 characters or less')
  .refine(
    (val) => {
      for (let i = 0; i < val.length; i++) {
        const code = val.charCodeAt(i);
        if ((code >= 0x00 && code <= 0x1f) || code === 0x7f) {
          return false;
        }
      }
      return true;
    },
    { message: 'device_name contains invalid control characters' },
  )
  .optional();

export const DeviceTypeSchema = z.enum([
  'desktop',
  'mobile',
  'web',
  'vscode',
  'cursor',
  'windsurf',
  'antigravity',
  'cli',
]);

export const DeviceFingerprintSchema = z
  .string()
  .min(1, 'device_fingerprint is required')
  .max(255, 'device_fingerprint must be 255 characters or less')
  .regex(/^[a-f0-9]+$/, 'device_fingerprint must be a valid hex string');

export const DeviceLinkRequestSchema = z.object({
  device_id: DeviceIdSchema,
  device_name: DeviceNameSchema,
  device_type: DeviceTypeSchema.optional(),
  device_fingerprint: DeviceFingerprintSchema,
});

export const DevicePollRequestSchema = z.object({
  device_id: DeviceIdSchema,
  device_fingerprint: DeviceFingerprintSchema.optional(),
});

export type DeviceLinkRequest = z.infer<typeof DeviceLinkRequestSchema>;
export type DevicePollRequest = z.infer<typeof DevicePollRequestSchema>;

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

export const QrLinkCodeSchema = z
  .string()
  .min(1, 'code is required')
  .max(64, 'code is too long')
  .transform((value) => value.trim().toUpperCase())
  .refine((value) => QR_LINK_CODE_PATTERN.test(value), 'code must be a 16-character hex string');
