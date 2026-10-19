import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type WorkspaceAccessModule = typeof import('@/app/api/settings/organization/workspace-access');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type PluginServiceModule = typeof import('@/lib/services/organization-plugin-service');
type SkillShareModule = typeof import('@/lib/services/skill-workspace-share-service');

const mocks = vi.hoisted(() => ({
  csrf: vi.fn(),
  rateLimit: vi.fn(),
  permission: vi.fn(),
  toPlugin: vi.fn(),
  publish: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: mocks.csrf,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mocks.rateLimit,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: async () => ({
    db: { query: vi.fn() },
    userId: 'admin-1',
    organizationId: 'org-1',
  }),
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: () => ({ query: vi.fn() }),
}));
vi.mock('@/app/api/settings/organization/workspace-access', async (importOriginal) => ({
  ...(await importOriginal<WorkspaceAccessModule>()),
  requireWorkspaceConsolePermission: mocks.permission,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: mocks.audit,
}));
vi.mock('@/lib/services/organization-plugin-service', async (importOriginal) => ({
  ...(await importOriginal<PluginServiceModule>()),
  publishOrganizationPlugins: mocks.publish,
}));
vi.mock('@/lib/services/skill-workspace-share-service', async (importOriginal) => ({
  ...(await importOriginal<SkillShareModule>()),
  personalSkillAsWorkspacePlugin: mocks.toPlugin,
}));

const { createError } = await import('@/lib/errors');
const { POST } = await import('./route');

const PLUGIN = { manifest: { name: 'release-notes' } };
const PUBLISHED = {
  id: 'plugin-1',
  pluginKey: 'release-notes',
  name: 'Release notes',
  description: '',
  version: '1.0.0',
  skills: ['release-notes'],
  scanVerdict: 'clean',
  scanFindings: [],
  status: 'active',
  installPreference: 'available',
  groupSettings: [],
  publishedAt: '2026-10-19T00:00:00.000Z',
  updatedAt: '2026-10-19T00:00:00.000Z',
};

function call(name = 'release-notes', query = '') {
  return POST(
    new NextRequest(`http://localhost/api/skills/${name}/workspace${query}`, { method: 'POST' }),
    { params: Promise.resolve({ name }) },
  );
}

describe('POST /api/skills/[name]/workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.csrf.mockResolvedValue(null);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.permission.mockResolvedValue({ userId: 'admin-1', organizationId: 'org-1' });
    mocks.toPlugin.mockResolvedValue(PLUGIN);
    mocks.publish.mockResolvedValue([PUBLISHED]);
    mocks.audit.mockResolvedValue(undefined);
  });

  it('publishes the admin’s personal skill to the workspace as available and audits it', async () => {
    const response = await call('release-notes', '?acknowledgedScan=scan-1');

    expect(response.status).toBe(201);
    expect(mocks.permission).toHaveBeenCalledWith(
      expect.anything(),
      'policy.manage',
      expect.stringContaining('workspace admin'),
    );
    expect(mocks.toPlugin).toHaveBeenCalledWith(expect.anything(), 'admin-1', 'release-notes');
    expect(mocks.publish).toHaveBeenCalledWith(expect.anything(), {
      organizationId: 'org-1',
      actorUserId: 'admin-1',
      plugins: [PLUGIN],
      acknowledgedScans: ['scan-1'],
      initialPreference: 'available',
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        organizationId: 'org-1',
        eventType: 'admin_policy_changed',
        detail: expect.objectContaining({
          resourceId: 'plugin-1',
          status: 'published',
          source: 'personal_skill',
        }),
      }),
    );
    expect(await response.json()).toEqual({ plugins: [PUBLISHED] });
  });

  it('publishes nothing for someone who cannot manage workspace policy', async () => {
    mocks.permission.mockRejectedValue(createError.forbidden('Only a workspace admin can share'));
    const response = await call();

    expect(response.status).toBe(403);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('refuses a skill name longer than any skill can have', async () => {
    const response = await call('x'.repeat(201));
    expect(response.status).toBe(400);
    expect(mocks.permission).not.toHaveBeenCalled();
  });

  it('returns the CSRF refusal before checking anything else', async () => {
    mocks.csrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await call();
    expect(response.status).toBe(403);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
