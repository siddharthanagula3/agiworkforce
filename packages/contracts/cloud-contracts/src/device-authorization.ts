import { z } from 'zod';

export const DEVICE_AUTHORIZATION_CODE_PATH = '/api/auth/device/code';
export const DEVICE_AUTHORIZATION_TOKEN_PATH = '/api/auth/device/token';
export const DEVICE_AUTHORIZATION_REFRESH_PATH = '/api/auth/device/refresh';
export const DEVICE_AUTHORIZATION_APPROVE_PATH = '/api/auth/device/approve';

/** RFC 8628 3.2: what a device shows the person and how often it may poll. */
export const DeviceAuthorizationStartResponseSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string().url(),
  verification_uri_complete: z.string().url(),
  interval: z.number().positive(),
  expires_in: z.number().positive(),
});
export type DeviceAuthorizationStartResponseWire = z.infer<
  typeof DeviceAuthorizationStartResponseSchema
>;

/** What the approval page shows about the device asking to sign in. */
export const DeviceAuthorizationLookupResponseSchema = z.object({
  user_code: z.string().min(1),
  client: z.object({ name: z.string(), type: z.string() }),
  scopes: z.array(z.object({ id: z.string(), label: z.string(), description: z.string() })),
  expires_at: z.string(),
});
export type DeviceAuthorizationLookupResponse = z.infer<
  typeof DeviceAuthorizationLookupResponseSchema
>;

/** The credential issued on approval and on each refresh. */
export const DeviceTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().min(1),
  expires_in: z.number().positive(),
  refresh_token_expires_in: z.number().positive().optional(),
});
export type DeviceTokenResponse = z.infer<typeof DeviceTokenResponseSchema>;

/**
 * Every refusal the token and refresh routes answer with. The first five are
 * RFC 8628 3.5 and RFC 6749 5.2; the last two are this service's own and carry
 * what the person needs to do next.
 */
export const DeviceTokenErrorSchema = z.discriminatedUnion('error', [
  z.object({ error: z.literal('authorization_pending') }),
  z.object({ error: z.literal('slow_down'), interval: z.number().positive().optional() }),
  z.object({ error: z.literal('access_denied') }),
  z.object({ error: z.literal('expired_token') }),
  z.object({ error: z.literal('invalid_grant') }),
  z.object({
    error: z.literal('account_unavailable'),
    error_description: z.string(),
    recovery_url: z.string().url().optional(),
  }),
  z.object({
    error: z.literal('terms_acceptance_required'),
    terms_version: z.string().optional(),
    acceptance_url: z.string().url(),
    error_description: z.string().optional(),
  }),
]);
export type DeviceTokenError = z.infer<typeof DeviceTokenErrorSchema>;

export const DeviceRefreshRequestSchema = z.object({ refresh_token: z.string().min(1) });
export type DeviceRefreshRequest = z.infer<typeof DeviceRefreshRequestSchema>;

export const DeviceApproveResponseSchema = z.object({
  success: z.literal(true),
  approved: z.boolean(),
  status: z.enum(['approved', 'denied']),
});
export type DeviceApproveResponse = z.infer<typeof DeviceApproveResponseSchema>;
