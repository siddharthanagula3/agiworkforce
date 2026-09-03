import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { unauthorizedResponseFor } = await import('../api-auth-response');
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
