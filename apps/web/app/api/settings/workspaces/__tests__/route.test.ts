import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/services/active-workspace-service');
type ScanModule1 = typeof import('@/features/workspaces/server/workspace-service');

const mocks = vi.hoisted(() => ({
  scoped: vi.fn(),
  selection: vi.fn(),
  list: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.scoped }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/error-handler', () => ({ withErrorHandler: (handler: unknown) => handler }));
vi.mock('@/lib/services/active-workspace-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  resolveActiveOrganizationId: mocks.selection,
}));
vi.mock('@/features/workspaces/server/workspace-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  listAccountWorkspaces: mocks.list,
}));

import { GET } from '../route';

const workspace = {
  id: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  kind: 'organization',
  name: 'Example workspace',
  slug: 'example',
  isPrimary: true,
  role: 'owner',
};
const db = { query: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scoped.mockResolvedValue({ db, userId: 'user-test', organizationId: null });
  mocks.list.mockResolvedValue([workspace]);
  mocks.selection.mockResolvedValue(workspace.organizationId);
});

describe('account workspace selection', () => {
  it('reports the selected organization while listing all account workspaces in personal scope', async () => {
    const request = new NextRequest('http://localhost/api/settings/workspaces', {
      headers: { Authorization: 'Bearer fixture-token' },
    });
    const response = await GET(request);
    expect(await response.json()).toMatchObject({
      accountId: 'user-test',
      activeWorkspaceId: workspace.id,
      activeOrganizationId: workspace.organizationId,
      scope: 'organization',
      workspaces: [workspace],
    });
    expect(mocks.scoped).toHaveBeenCalledWith(request, { resolveOrganization: false });
    expect(mocks.selection).toHaveBeenCalledWith(db, 'user-test', request);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('reports personal selection when the canonical resolver returns no active organization', async () => {
    mocks.selection.mockResolvedValue(null);
    const response = await GET(new NextRequest('http://localhost/api/settings/workspaces', {
      headers: { Authorization: 'Bearer fixture-token' },
    }));
    expect(await response.json()).toMatchObject({
      accountId: 'user-test',
      activeWorkspaceId: null,
      activeOrganizationId: null,
      scope: 'personal',
      workspaces: [workspace],
    });
  });

  it('emits the resolved product account ID rather than a provider subject supplied by a client', async () => {
    mocks.scoped.mockResolvedValue({ db, userId: 'mapped-product-account', organizationId: null });
    const request = new NextRequest('http://localhost/api/settings/workspaces?accountId=provider-subject', {
      headers: { Authorization: 'Bearer fixture-token' },
    });
    const response = await GET(request);
    expect(await response.json()).toMatchObject({ accountId: 'mapped-product-account' });
    expect(mocks.list).toHaveBeenCalledWith(db, 'mapped-product-account');
    expect(mocks.selection).toHaveBeenCalledWith(db, 'mapped-product-account', request);
  });

  it('does not label the existing cookie-auth subject as a resolved product account ID', async () => {
    mocks.scoped.mockResolvedValue({ db, userId: 'provider-subject', organizationId: null });
    const response = await GET(new NextRequest('http://localhost/api/settings/workspaces'));
    const body = await response.json();
    expect(body).not.toHaveProperty('accountId');
    expect(body).toMatchObject({ activeOrganizationId: workspace.organizationId, workspaces: [workspace] });
  });
});
