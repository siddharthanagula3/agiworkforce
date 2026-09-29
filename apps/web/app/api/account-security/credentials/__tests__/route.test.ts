import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  accountSecurityCaller: vi.fn(),
  finishCredentialRegistration: vi.fn(),
  requireStepUp: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/server/step-up-auth', () => ({ requireStepUp: mocks.requireStepUp }));
vi.mock('@/lib/server/account-security/service', () => ({
  ACCOUNT_SECURITY_SCOPE: { resolveOrganization: false },
  accountSecurityCaller: mocks.accountSecurityCaller,
  finishCredentialRegistration: mocks.finishCredentialRegistration,
}));

import { AppError, createError } from '@/lib/errors';
import { POST } from '../route';

const scoped = { db: { query: vi.fn() }, userId: 'user-1', organizationId: null };
const caller = { ...scoped, sessionId: 'sess-1' };
const validBody = { name: 'Work laptop', response: { id: 'raw-id', type: 'public-key' } };

function request(body: unknown): never {
  return new Request('http://localhost/api/account-security/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as never;
}

describe('POST /api/account-security/credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue(scoped);
    mocks.accountSecurityCaller.mockResolvedValue(caller);
    mocks.requireStepUp.mockResolvedValue({});
    mocks.finishCredentialRegistration.mockResolvedValue({
      id: 'cred-1',
      name: 'Work laptop',
      createdAt: '2026-09-28T00:00:00.000Z',
    });
  });

  it('refuses a request without a valid CSRF token', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request(validBody));

    expect(response.status).toBe(403);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    expect(mocks.finishCredentialRegistration).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await POST(request(validBody));

    expect(response.status).toBe(401);
    expect(mocks.finishCredentialRegistration).not.toHaveBeenCalled();
  });

  it('rejects a body without a name before step-up', async () => {
    const response = await POST(request({ response: {} }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Name the passkey or security key and try again.',
      },
    });
    expect(mocks.requireStepUp).not.toHaveBeenCalled();
    expect(mocks.finishCredentialRegistration).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const response = await POST(request('not json'));

    expect(response.status).toBe(400);
    expect(mocks.finishCredentialRegistration).not.toHaveBeenCalled();
  });

  it('does not register when step-up is refused', async () => {
    mocks.requireStepUp.mockRejectedValue(
      new AppError('STEP_UP_REQUIRED' as never, 'Confirm it is you.', 403),
    );

    const response = await POST(request(validBody));

    expect(response.status).toBe(403);
    expect(mocks.finishCredentialRegistration).not.toHaveBeenCalled();
  });

  it('registers the credential for the caller after step-up', async () => {
    const response = await POST(request(validBody));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      credential: { id: 'cred-1', name: 'Work laptop', createdAt: '2026-09-28T00:00:00.000Z' },
    });
    expect(mocks.requireStepUp).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'account_security.change',
        endpoint: '/api/account-security/credentials',
      }),
    );
    expect(mocks.finishCredentialRegistration).toHaveBeenCalledWith(
      caller,
      validBody,
      expect.anything(),
    );
  });

  it('maps an already registered key to 409', async () => {
    mocks.finishCredentialRegistration.mockRejectedValue(
      createError.conflict('This passkey or security key is already registered.'),
    );

    const response = await POST(request(validBody));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'CONFLICT', message: 'This passkey or security key is already registered.' },
    });
  });

  it('maps a key that fails verification to 400', async () => {
    mocks.finishCredentialRegistration.mockRejectedValue(
      createError.validation('This passkey or security key could not be verified. Try again.'),
    );

    const response = await POST(request(validBody));

    expect(response.status).toBe(400);
  });
});
