/**
 * Settings Form Validation Schemas
 * Comprehensive Zod schemas for all settings forms with XSS sanitization
 *
 * @module features/settings/schemas/settings-validation
 */

import { z } from 'zod';
import { sanitizeUserInput } from '@shared/utils/html-sanitizer';
import { API_KEY_SCOPE_VALUES } from '@/lib/api-key-scopes';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const changePasswordSchema = z
  .object({
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

export const securitySettingsSchema = z.object({
  two_factor_enabled: z.boolean(),
  session_timeout: z
    .number()
    .int('Session timeout must be a whole number')
    .min(15, 'Session timeout must be at least 15 minutes')
    .max(1440, 'Session timeout cannot exceed 24 hours'),
});

export type SecuritySettingsFormData = z.infer<typeof securitySettingsSchema>;

export const createApiKeySchema = z.object({
  name: z
    .string()
    .min(1, 'API key name is required')
    .max(100, 'API key name must be less than 100 characters')
    .transform((val) => sanitizeUserInput(val, 100)),
  scopes: z
    .array(z.enum(API_KEY_SCOPE_VALUES))
    .min(1, 'Select at least one scope')
    .max(API_KEY_SCOPE_VALUES.length)
    .refine((scopes) => new Set(scopes).size === scopes.length, 'Scopes must be unique'),
});

export type CreateApiKeyFormData = z.infer<typeof createApiKeySchema>;

export function validateFormData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  const issues =
    (result.error as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues ||
    [];

  for (const issue of issues) {
    const path = issue.path.join('.');
    if (!errors[path]) {
      errors[path] = issue.message;
    }
  }

  if (Object.keys(errors).length === 0 && issues.length > 0) {
    errors['_root'] = issues[0]!.message;
  }

  return { success: false, errors };
}

export function getFirstError(error: z.ZodError): string {
  const issues = (error as { issues?: Array<{ message: string }> }).issues || [];
  return issues[0]?.message || 'Validation failed';
}

export function zodErrorsToFormErrors(error: z.ZodError): Record<string, { message: string }> {
  const formErrors: Record<string, { message: string }> = {};

  for (const zodError of error.issues) {
    const path = zodError.path.join('.');
    if (path && !formErrors[path]) {
      formErrors[path] = { message: zodError.message };
    }
  }

  return formErrors;
}

const IPV4_OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_ADDRESS_PATTERN = new RegExp(
  `^${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}$`,
);
const IPV6_ADDRESS_PATTERN =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|::(ffff(:0{1,4})?:)?((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d))$/;
const MAX_CIDR_PREFIX: Readonly<Record<'v4' | 'v6', number>> = Object.freeze({ v4: 32, v6: 128 });

/**
 * Format check for one IP allow list entry, mirroring the server's
 * `isValidCidr` (`@/lib/services/ip-allow-list`) without importing
 * `node:net` into a client bundle. The server remains the authority: this
 * only gives the admin inline feedback before they save.
 */
export function isValidIpOrCidr(value: string): boolean {
  const segments = value.split('/');
  if (segments.length > 2) return false;
  const [address, prefixRaw] = segments;
  if (!address) return false;
  const family = IPV4_ADDRESS_PATTERN.test(address)
    ? 'v4'
    : IPV6_ADDRESS_PATTERN.test(address)
      ? 'v6'
      : null;
  if (!family) return false;
  if (prefixRaw === undefined) return true;
  if (!/^\d+$/.test(prefixRaw)) return false;
  const prefix = Number(prefixRaw);
  return prefix >= 0 && prefix <= MAX_CIDR_PREFIX[family];
}
