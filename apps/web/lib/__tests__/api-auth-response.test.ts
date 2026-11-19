import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { isAuthGateRefusal, unauthorizedResponseFor } = await import('../api-auth-response');
const { MfaRequiredError } = await import('../mfa-policy-gate');
const { IpNotAllowedError } = await import('../ip-allow-list-gate');
const { createError } = await import('../errors');

describe('unauthorizedResponseFor', () => {
  it('surfaces an mfa requirement as a 403 with the safe-to-expose copy', async () => {
    const response = unauthorizedResponseFor(
      new MfaRequiredError('Your workspace requires two-factor authentication.'),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('MFA_REQUIRED');
    expect(body.error.message).toBe('Your workspace requires two-factor authentication.');
  });

  it('surfaces an ip allow list denial as a 403 with the safe-to-expose copy', async () => {
    const response = unauthorizedResponseFor(new IpNotAllowedError('network not allowed'));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('IP_NOT_ALLOWED');
    expect(body.error.message).toBe('network not allowed');
  });

  it('falls back to a generic 401 for any other error', async () => {
    const response = unauthorizedResponseFor(createError.unauthorized('irrelevant'));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Authentication required' });
  });

  it('falls back to a generic 401 when the auth gate throws something unrecognised', async () => {
    const response = unauthorizedResponseFor(new Error('boom'));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Authentication required' });
  });
});

describe('isAuthGateRefusal', () => {
  it('passes a dependency that could not answer through as 503 with a retry hint', async () => {
    const outage = createError.serviceUnavailable('Unable to verify account status.');

    expect(isAuthGateRefusal(outage)).toBe(true);
    const response = unauthorizedResponseFor(outage);

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toMatch(/^\d+$/);
    const body = await response.json();
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('passes a workspace lockdown through as 403 with its own words', async () => {
    const lockdown = createError
      .forbidden('This workspace is locked down while an incident is investigated.')
      .asUserSafe();

    expect(isAuthGateRefusal(lockdown)).toBe(true);
    const response = unauthorizedResponseFor(lockdown);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatchObject({
      code: 'FORBIDDEN',
      message: 'This workspace is locked down while an incident is investigated.',
    });
  });

  it('treats only a 401 as a credential failure', () => {
    expect(isAuthGateRefusal(createError.unauthorized())).toBe(false);
    expect(isAuthGateRefusal(new Error('boom'))).toBe(false);
  });
});
