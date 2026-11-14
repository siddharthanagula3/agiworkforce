import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  requireCsrfToken: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  withRateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  logSecurityEvent: vi.fn(),
  start: vi.fn(),
}));

vi.mock('@/lib/auth-guards', () => ({
  requirePlatformAdmin: (...args: unknown[]) => mocks.requirePlatformAdmin(...args),
}));
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: (...args: unknown[]) => mocks.requireCsrfToken(...args),
}));
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mocks.withRateLimit(...args),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  getClientIp: () => '203.0.113.1',
  logSecurityEvent: (...args: unknown[]) => mocks.logSecurityEvent(...args),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ name: 'owner-db' }) }));
vi.mock('@/lib/services/product-update-notification-service', async (importOriginal) => ({
  ...(await importOriginal<ProductUpdateServiceModule>()),
  startProductUpdateAnnouncement: (...args: unknown[]) => mocks.start(...args),
}));

import { createError } from '@/lib/errors';
import { RELEASES, releaseSlug } from '@/lib/changelog-entries';
import { POST } from '../route';

type SecurityAuditModule = typeof import('@/lib/security-audit');
type ProductUpdateServiceModule =
  typeof import('@/lib/services/product-update-notification-service');

const SLUG = releaseSlug(RELEASES[0]!);

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/product-updates', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'operator_1' });
  mocks.logSecurityEvent.mockResolvedValue(undefined);
  mocks.start.mockResolvedValue({ status: 'started', release: SLUG, jobId: 'job-1' });
});

describe('the product update announcement route', () => {
  it('answers not found to a signed-in account that is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await POST(request({ release: SLUG }));

    expect(response.status).toBe(404);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.logSecurityEvent).not.toHaveBeenCalled();
  });

  it('refuses a request without a valid CSRF token', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request({ release: SLUG }));

    expect(response.status).toBe(403);
    expect(mocks.requirePlatformAdmin).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('starts the announcement after writing the audit row', async () => {
    const response = await POST(request({ release: SLUG }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ release: SLUG, jobId: 'job-1' });
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'operator_1',
        eventType: 'admin_action',
        details: { action: 'product_update_announce', release: SLUG },
      }),
      { required: true },
    );
    expect(mocks.logSecurityEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.start.mock.invocationCallOrder[0]!,
    );
  });

  it('sends nothing when the audit row cannot be written', async () => {
    mocks.logSecurityEvent.mockRejectedValue(new Error('audit store down'));

    const response = await POST(request({ release: SLUG }));

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('refuses a release that was already announced', async () => {
    mocks.start.mockResolvedValue({ status: 'already_announced', release: SLUG });

    const response = await POST(request({ release: SLUG }));

    expect(response.status).toBe(409);
  });

  it('refuses an unknown release before anything is written', async () => {
    const response = await POST(request({ release: 'made-up-release' }));

    expect(response.status).toBe(404);
    expect(mocks.logSecurityEvent).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('rejects a malformed body', async () => {
    const response = await POST(request({ release: SLUG, audience: 'everyone' }));

    expect(response.status).toBe(400);
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
