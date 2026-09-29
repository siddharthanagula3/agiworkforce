import { describe, expect, it } from 'vitest';

import {
  DeviceAuthorizationStartResponseSchema,
  DeviceTokenErrorSchema,
  DeviceTokenResponseSchema,
} from '../device-authorization';

describe('device authorization contract', () => {
  it('reads the start reply the code route issues', () => {
    expect(
      DeviceAuthorizationStartResponseSchema.safeParse({
        device_code: '8cc8544f-7d36-4ec3-aae2-ce49740fa59c',
        user_code: 'ABCD-2345',
        verification_uri: 'https://agiworkforce.com/auth/device',
        verification_uri_complete: 'https://agiworkforce.com/auth/device?user_code=ABCD-2345',
        interval: 5,
        expires_in: 900,
      }).success,
    ).toBe(true);
  });

  it('names every refusal the token and refresh routes send, and nothing else', () => {
    for (const body of [
      { error: 'authorization_pending' },
      { error: 'slow_down', interval: 9 },
      { error: 'slow_down' },
      { error: 'access_denied' },
      { error: 'expired_token' },
      { error: 'invalid_grant' },
      { error: 'account_unavailable', error_description: 'Suspended.' },
      {
        error: 'terms_acceptance_required',
        terms_version: '2026-09-01',
        acceptance_url: 'https://agiworkforce.com/login/complete',
      },
    ]) {
      expect(DeviceTokenErrorSchema.safeParse(body).success).toBe(true);
    }
    expect(DeviceTokenErrorSchema.safeParse({ error: 'server_error' }).success).toBe(false);
    expect(DeviceTokenErrorSchema.safeParse({ error: 'account_unavailable' }).success).toBe(false);
  });

  it('requires a bearer credential with a positive lifetime', () => {
    expect(
      DeviceTokenResponseSchema.safeParse({
        access_token: 'token',
        refresh_token: 'refresh',
        token_type: 'Bearer',
        expires_in: 600,
        refresh_token_expires_in: 2_592_000,
      }).success,
    ).toBe(true);
    expect(
      DeviceTokenResponseSchema.safeParse({
        access_token: 'token',
        token_type: 'Bearer',
        expires_in: 0,
      }).success,
    ).toBe(false);
  });
});
