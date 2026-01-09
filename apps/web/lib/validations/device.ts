import { z } from 'zod';

export const DeviceIdSchema = z
  .string()
  .min(1, 'device_id is required')
  .max(255, 'device_id must be 255 characters or less')
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    'device_id contains invalid characters. Only alphanumeric, dashes, underscores, and dots are allowed.',
  );

export const DeviceNameSchema = z
  .string()
  .max(200, 'device_name must be 200 characters or less')
  .refine(
    (val) => {
      // Check for control characters (0x00-0x1F and 0x7F)
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

export const DeviceTypeSchema = z.enum(['desktop', 'mobile', 'web']);

export const DeviceFingerprintSchema = z
  .string()
  .min(1, 'device_fingerprint is required')
  .max(255, 'device_fingerprint must be 255 characters or less')
  .regex(/^[a-f0-9]+$/, 'device_fingerprint must be a valid hex string');

export const DeviceLinkRequestSchema = z.object({
  device_id: DeviceIdSchema,
  device_name: DeviceNameSchema,
  device_type: DeviceTypeSchema.optional(),
  device_fingerprint: DeviceFingerprintSchema.optional(),
});

export const DevicePollRequestSchema = z.object({
  device_id: DeviceIdSchema,
  device_fingerprint: DeviceFingerprintSchema.optional(),
});

export type DeviceLinkRequest = z.infer<typeof DeviceLinkRequestSchema>;
export type DevicePollRequest = z.infer<typeof DevicePollRequestSchema>;
