import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  assertAccountActive: vi.fn(),
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  listCopyrightNotices: vi.fn(),
  setCopyrightNoticeDisposition: vi.fn(),
  logSecurityEvent: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: mocks.getClerkAuthUser,
  assertAccountActive: mocks.assertAccountActive,
}));
vi.mock('@/lib/server/identity', () => ({ getIdentityUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/security-audit', () => ({
  getClientIp: vi.fn(() => '203.0.113.9'),
  logSecurityEvent: mocks.logSecurityEvent,
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mocks.db }));
vi.mock('@/lib/server/copyright-notices', () => ({
  listCopyrightNotices: mocks.listCopyrightNotices,
  setCopyrightNoticeDisposition: mocks.setCopyrightNoticeDisposition,
}));

import { createError } from '@/lib/errors';
import { GET, POST } from '../route';

const OPERATOR = 'operator_1';
const NOTICE = {
  reference: 'CN-0001',
  status: 'actioned',
  noticeType: 'dmca',
  targetKind: 'published_artifact',
};

function getRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/admin/copyright-notices${query}`);
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/copyright-notices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AGI_PLATFORM_ADMIN_USER_IDS', OPERATOR);
  mocks.getClerkAuthUser.mockResolvedValue({ userId: OPERATOR });
  mocks.assertAccountActive.mockResolvedValue(undefined);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.listCopyrightNotices.mockResolvedValue([NOTICE]);
  mocks.setCopyrightNoticeDisposition.mockResolvedValue(NOTICE);
});

describe('GET /api/admin/copyright-notices', () => {
  it('rejects a signed-out caller with 401', async () => {
    mocks.getClerkAuthUser.mockRejectedValue(createError.unauthorized());

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
    expect(mocks.listCopyrightNotices).not.toHaveBeenCalled();
  });

  it('answers 404 to a signed-in user who is not a platform operator', async () => {
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'org_owner_1' });

    const response = await GET(getRequest());

    expect(response.status).toBe(404);
    expect(mocks.listCopyrightNotices).not.toHaveBeenCalled();
  });

  it('answers 404 to an operator id presented through a developer token', async () => {
    mocks.getClerkAuthUser.mockResolvedValue({ userId: OPERATOR, surfaceClass: 'developer' });

    const response = await GET(getRequest());

    expect(response.status).toBe(404);
    expect(mocks.listCopyrightNotices).not.toHaveBeenCalled();
  });

  it('rejects an unknown status filter', async () => {
    const response = await GET(getRequest('?status=pending'));

    expect(response.status).toBe(400);
    expect(mocks.listCopyrightNotices).not.toHaveBeenCalled();
  });

  it('lists notices for an operator with the status filter and no caching', async () => {
    const response = await GET(getRequest('?status=received'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ notices: [NOTICE] });
    expect(mocks.listCopyrightNotices).toHaveBeenCalledWith(mocks.db, { status: 'received' });
  });
});

describe('POST /api/admin/copyright-notices', () => {
  const decision = { reference: 'CN-0001', status: 'actioned', note: 'Removed the listing' };

  it('returns the CSRF refusal before anything else', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(postRequest(decision));

    expect(response.status).toBe(403);
    expect(mocks.getClerkAuthUser).not.toHaveBeenCalled();
    expect(mocks.setCopyrightNoticeDisposition).not.toHaveBeenCalled();
  });

  it('refuses a non-operator with 404 and records nothing', async () => {
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'org_admin_1' });

    const response = await POST(postRequest(decision));

    expect(response.status).toBe(404);
    expect(mocks.setCopyrightNoticeDisposition).not.toHaveBeenCalled();
    expect(mocks.logSecurityEvent).not.toHaveBeenCalled();
  });

  it('rejects a decision without a note', async () => {
    const response = await POST(postRequest({ reference: 'CN-0001', status: 'actioned' }));

    expect(response.status).toBe(400);
    expect(mocks.setCopyrightNoticeDisposition).not.toHaveBeenCalled();
  });

  it('answers 404 when no notice has the reference', async () => {
    mocks.setCopyrightNoticeDisposition.mockResolvedValue(null);

    const response = await POST(postRequest(decision));

    expect(response.status).toBe(404);
    expect(mocks.logSecurityEvent).not.toHaveBeenCalled();
  });

  it('records the disposition and audits it under the operator', async () => {
    const response = await POST(postRequest(decision));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notice: NOTICE });
    expect(mocks.setCopyrightNoticeDisposition).toHaveBeenCalledWith(
      mocks.db,
      'CN-0001',
      'actioned',
      'Removed the listing',
    );
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OPERATOR,
        eventType: 'admin_action',
        details: expect.objectContaining({
          action: 'content_notice_disposition',
          reference: 'CN-0001',
        }),
      }),
    );
  });
});
