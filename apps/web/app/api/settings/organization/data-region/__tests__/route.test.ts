import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DataRegionUnavailableError } from '@agiworkforce/compliance';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  requireWorkspaceConsolePermission: vi.fn(),
  resolveOrganizationEntitlementPlan: vi.fn(),
  readOrganizationRegion: vi.fn(),
  requestOrganizationRegionMove: vi.fn(),
  cancelOrganizationRegionMove: vi.fn(),
  isRegionProvisioned: vi.fn(),
  neonDb: { query: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mocks.neonDb }));
vi.mock('@/lib/server/data-region', () => ({
  readOrganizationRegion: mocks.readOrganizationRegion,
  requestOrganizationRegionMove: mocks.requestOrganizationRegionMove,
  cancelOrganizationRegionMove: mocks.cancelOrganizationRegionMove,
  isRegionProvisioned: mocks.isRegionProvisioned,
}));
vi.mock('@/lib/services/org-entitlements', () => ({
  resolveOrganizationEntitlementPlan: mocks.resolveOrganizationEntitlementPlan,
}));
vi.mock('@/app/api/settings/organization/workspace-access', () => ({
  requireWorkspaceConsolePermission: mocks.requireWorkspaceConsolePermission,
}));

import { DELETE, GET, POST } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';

function region(effective: 'us' | 'eu', requested: 'us' | 'eu' | null = null) {
  return { effective, requested, requestedAt: null, provisioned: true, missing: [] };
}

function call(method: 'GET' | 'POST' | 'DELETE', body?: unknown) {
  const request = new NextRequest('http://localhost/api/settings/organization/data-region', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (method === 'GET') return GET(request);
  return method === 'POST' ? POST(request) : DELETE(request);
}

describe('/api/settings/organization/data-region', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.requireWorkspaceConsolePermission.mockResolvedValue({
      userId: 'admin-1',
      organizationId: ORG,
    });
    mocks.resolveOrganizationEntitlementPlan.mockResolvedValue('enterprise');
    mocks.readOrganizationRegion.mockResolvedValue(region('us'));
    mocks.isRegionProvisioned.mockImplementation((id: string) => id === 'us');
  });

  describe('GET', () => {
    it('returns 403 for a member without policy view permission', async () => {
      mocks.requireWorkspaceConsolePermission.mockRejectedValue(createError.forbidden('no'));

      const response = await call('GET');

      expect(response.status).toBe(403);
      expect(mocks.requireWorkspaceConsolePermission).toHaveBeenCalledWith(
        expect.anything(),
        'admin.policy.view',
        expect.any(String),
      );
      expect(mocks.readOrganizationRegion).not.toHaveBeenCalled();
    });

    it('returns the workspace region, options and plan gate', async () => {
      mocks.resolveOrganizationEntitlementPlan.mockResolvedValue('team');

      const response = await call('GET');

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(await response.json()).toEqual({
        organizationId: ORG,
        region: region('us'),
        regions: [
          { id: 'us', label: 'United States', available: true },
          { id: 'eu', label: 'European Union', available: false },
        ],
        canMove: false,
      });
      expect(mocks.readOrganizationRegion).toHaveBeenCalledWith(mocks.neonDb, ORG);
    });
  });

  describe('POST', () => {
    it('returns the csrf refusal before checking permission', async () => {
      mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

      const response = await call('POST', { region: 'eu' });

      expect(response.status).toBe(403);
      expect(mocks.requireWorkspaceConsolePermission).not.toHaveBeenCalled();
    });

    it('requires the policy manage permission', async () => {
      mocks.requireWorkspaceConsolePermission.mockRejectedValue(createError.forbidden('no'));

      const response = await call('POST', { region: 'eu' });

      expect(response.status).toBe(403);
      expect(mocks.requireWorkspaceConsolePermission).toHaveBeenCalledWith(
        expect.anything(),
        'admin.policy.manage',
        expect.any(String),
      );
    });

    it('refuses a workspace without an Enterprise plan', async () => {
      mocks.resolveOrganizationEntitlementPlan.mockResolvedValue('team');

      const response = await call('POST', { region: 'eu' });

      expect(response.status).toBe(403);
      expect((await response.json()).error.message).toContain('Enterprise plan');
      expect(mocks.requestOrganizationRegionMove).not.toHaveBeenCalled();
    });

    it.each([{ region: 'mars' }, { region: 'eu', extra: true }, {}])(
      'rejects an invalid body %j',
      async (body) => {
        const response = await call('POST', body);

        expect(response.status).toBe(400);
        expect(mocks.requestOrganizationRegionMove).not.toHaveBeenCalled();
      },
    );

    it('refuses a move to the region the data is already in', async () => {
      const response = await call('POST', { region: 'us' });

      expect(response.status).toBe(400);
      expect(mocks.requestOrganizationRegionMove).not.toHaveBeenCalled();
    });

    it('answers 409 when the target region is not provisioned', async () => {
      mocks.requestOrganizationRegionMove.mockRejectedValue(
        new DataRegionUnavailableError('eu', ['DATABASE_URL_EU']),
      );

      const response = await call('POST', { region: 'eu' });

      expect(response.status).toBe(409);
      expect((await response.json()).error.message).toContain('European Union');
    });

    it('requests the move as the acting admin', async () => {
      mocks.requestOrganizationRegionMove.mockResolvedValue(region('us', 'eu'));

      const response = await call('POST', { region: 'eu' });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.region).toEqual(region('us', 'eu'));
      expect(body.canMove).toBe(true);
      expect(mocks.requestOrganizationRegionMove).toHaveBeenCalledWith({
        db: mocks.neonDb,
        organizationId: ORG,
        actorUserId: 'admin-1',
        target: 'eu',
      });
    });
  });

  describe('DELETE', () => {
    it('returns the csrf refusal', async () => {
      mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

      const response = await call('DELETE');

      expect(response.status).toBe(403);
      expect(mocks.cancelOrganizationRegionMove).not.toHaveBeenCalled();
    });

    it('cancels a pending move as the acting admin', async () => {
      mocks.cancelOrganizationRegionMove.mockResolvedValue(region('us'));

      const response = await call('DELETE');

      expect(response.status).toBe(200);
      expect((await response.json()).region).toEqual(region('us'));
      expect(mocks.cancelOrganizationRegionMove).toHaveBeenCalledWith({
        db: mocks.neonDb,
        organizationId: ORG,
        actorUserId: 'admin-1',
      });
    });
  });
});
