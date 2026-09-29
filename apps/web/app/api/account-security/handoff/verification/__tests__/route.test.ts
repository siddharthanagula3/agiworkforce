import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getNeonDb: vi.fn(),
  finishHandoffVerification: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mocks.getNeonDb }));
vi.mock('@/lib/server/account-security/handoff', () => ({
  finishHandoffVerification: mocks.finishHandoffVerification,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const HANDOFF = 'h'.repeat(43);
const assertion = { id: 'raw-id', type: 'public-key' };
const neonDb = { query: vi.fn() };

function request(body: unknown): never {
  return new Request('http://localhost/api/account-security/handoff/verification', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/account-security/handoff/verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getNeonDb.mockReturnValue(neonDb);
    mocks.finishHandoffVerification.mockResolvedValue('agiworkforce://account-security/verified');
  });

  it('refuses a request without a valid CSRF token', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request({ handoff: HANDOFF, response: assertion }));

    expect(response.status).toBe(403);
    expect(mocks.finishHandoffVerification).not.toHaveBeenCalled();
  });

  it('rejects a body without an assertion with 400', async () => {
    const response = await POST(request({ handoff: HANDOFF }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Use one of your passkeys or security keys.' },
    });
    expect(mocks.finishHandoffVerification).not.toHaveBeenCalled();
  });

  it('returns the app return URL once the handoff is verified', async () => {
    const response = await POST(request({ handoff: HANDOFF, response: assertion }));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({
      returnUrl: 'agiworkforce://account-security/verified',
    });
    expect(mocks.withRateLimit).toHaveBeenCalledWith(expect.anything(), 'account-security-handoff');
    expect(mocks.finishHandoffVerification).toHaveBeenCalledWith(
      neonDb,
      HANDOFF,
      assertion,
      expect.anything(),
    );
  });

  it('maps an expired handoff to 404', async () => {
    mocks.finishHandoffVerification.mockRejectedValue(
      createError.notFound('This link expired. Start again from the app.').asUserSafe(),
    );

    const response = await POST(request({ handoff: HANDOFF, response: assertion }));

    expect(response.status).toBe(404);
  });

  it('maps a failed assertion to 400 with the service message', async () => {
    mocks.finishHandoffVerification.mockRejectedValue(
      createError.validation(
        'That passkey or security key could not be verified. Try again, or use a different one.',
      ),
    );

    const response = await POST(request({ handoff: HANDOFF, response: assertion }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message:
          'That passkey or security key could not be verified. Try again, or use a different one.',
      },
    });
  });
});
