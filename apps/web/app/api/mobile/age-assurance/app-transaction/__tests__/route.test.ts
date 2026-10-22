import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(async () => 'user-1'),
  rateLimit: vi.fn(async () => null as Response | null),
  csrf: vi.fn(async () => null as Response | null),
  verify: vi.fn(),
  register: vi.fn(async (_input: unknown) => ({ consentWithdrawn: false })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.rateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.csrf }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-chat', () => ({ requireCurrentUserId: mocks.requireUser }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
type StoreVerificationModule = typeof import('@/lib/server/mobile-iap-store-verification');

vi.mock('@/lib/server/mobile-iap-store-verification', async (importOriginal) => ({
  ...(await importOriginal<StoreVerificationModule>()),
  verifyAppleAppTransaction: mocks.verify,
}));
vi.mock('@/lib/services/mobile-iap-notification-service', () => ({
  registerAppleAppTransaction: mocks.register,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const SIGNED = 'signed-app-transaction-fixture-long-enough';

function request(body: unknown) {
  return new Request('http://localhost:3000/api/mobile/age-assurance/app-transaction', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/mobile/age-assurance/app-transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ appTransactionId: 'app-tx-1', environment: 'production' });
  });

  it('records the install Apple signed against the signed-in account', async () => {
    const response = await POST(request({ signedAppTransaction: SIGNED }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ registered: true, consentWithdrawn: false });
    expect(mocks.verify).toHaveBeenCalledWith(SIGNED);
    expect(mocks.register).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        appTransactionId: 'app-tx-1',
        environment: 'production',
      }),
    );
  });

  it('tells the app when the install it registered has had consent withdrawn', async () => {
    mocks.register.mockResolvedValueOnce({ consentWithdrawn: true });

    const response = await POST(request({ signedAppTransaction: SIGNED }));

    expect(await response.json()).toEqual({ registered: true, consentWithdrawn: true });
  });

  it('records nothing when Apple did not sign the app transaction', async () => {
    mocks.verify.mockRejectedValueOnce(
      createError.badRequest('Apple could not verify this app transaction.'),
    );

    const response = await POST(request({ signedAppTransaction: SIGNED }));

    expect(response.status).toBe(400);
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it('takes no raw id from the client', async () => {
    const response = await POST(
      request({ signedAppTransaction: SIGNED, appTransactionId: 'client-chosen' }),
    );

    expect(response.status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it('answers a rate-limited caller before reading the session', async () => {
    mocks.rateLimit.mockResolvedValueOnce(new Response(null, { status: 429 }));

    const response = await POST(request({ signedAppTransaction: SIGNED }));

    expect(response.status).toBe(429);
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });

  it('refuses a request without a valid CSRF token', async () => {
    mocks.csrf.mockResolvedValueOnce(new Response(null, { status: 403 }));

    const response = await POST(request({ signedAppTransaction: SIGNED }));

    expect(response.status).toBe(403);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});
