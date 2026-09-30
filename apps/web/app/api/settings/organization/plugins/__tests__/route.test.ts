import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  recordAuditEvent: vi.fn(),
  requireWorkspaceConsolePermission: vi.fn(),
  resolveWorkspaceConsoleAccess: vi.fn(),
  listOrganizationPlugins: vi.fn(),
  listOrganizationPluginGroups: vi.fn(),
  publishOrganizationPlugins: vi.fn(),
  updateOrganizationPlugin: vi.fn(),
  readArchiveUpload: vi.fn(),
  neonDb: { query: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  getOrCreateAnonSession: vi.fn(),
  getSessionIdFromRequest: vi.fn(),
  isBearerTokenValid: vi.fn(),
  readCookie: vi.fn(),
  resetCsrfCache: vi.fn(),
  validateCsrfFromRequest: vi.fn(),
  verifyCsrfToken: vi.fn(),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  BLOCK_APPEAL_PATH: '/support',
  SECURITY_EVENT_ACTIVITY_REDIS_KEY: 'agi-security-audit:pending-anomaly-check',
  auditEnvelopeFields: vi.fn(),
  auditRetentionClassFor: vi.fn(),
  consumePendingSecurityAnomalyCheck: vi.fn(),
  getClientIp: vi.fn(),
  logAuthFailure: vi.fn(),
  logAuthorizationFailure: vi.fn(),
  logCsrfFailure: vi.fn(),
  logInvalidSignature: vi.fn(),
  logRateLimitExceeded: vi.fn(),
  logSecurityEvent: vi.fn(),
  logSuspiciousActivity: vi.fn(),
  sanitizeAuditDetail: vi.fn(),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: () => mocks.neonDb,
}));
vi.mock('@/lib/services/organization-plugin-service', () => ({
  isMissingOrganizationPluginSchema: vi.fn(),
  listMemberOrganizationPlugins: vi.fn(),
  listOrganizationPluginSkillFiles: vi.fn(),
  listOrganizationSkillCompanions: vi.fn(),
  readOrganizationPluginFile: vi.fn(),
  updateMemberOrganizationPlugin: vi.fn(),
  listOrganizationPlugins: mocks.listOrganizationPlugins,
  listOrganizationPluginGroups: mocks.listOrganizationPluginGroups,
  publishOrganizationPlugins: mocks.publishOrganizationPlugins,
  updateOrganizationPlugin: mocks.updateOrganizationPlugin,
}));
vi.mock('@/features/plugins/server/directory/archive-upload', async () => {
  const { NextResponse: Response } = await import('next/server');
  return {
    invalidUploadResponse: vi.fn(),
    readArchiveUpload: mocks.readArchiveUpload,
    rejectedUploadResponse: (message: string) =>
      Response.json({ error: { code: 'PLUGIN_UPLOAD_REJECTED', message } }, { status: 422 }),
  };
});
vi.mock('@/app/api/settings/organization/workspace-access', () => ({
  requireWorkspaceConsolePermission: mocks.requireWorkspaceConsolePermission,
  resolveWorkspaceConsoleAccess: mocks.resolveWorkspaceConsoleAccess,
}));

import { GET, PATCH, POST } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const PLUGIN = '44444444-4444-4444-8444-444444444444';
const manager = {
  userId: 'admin-1',
  organizationId: ORG,
  access: { role: 'admin', permissions: new Set(['policy.manage']) },
};

function call(method: 'GET' | 'POST' | 'PATCH', body?: unknown) {
  const request = new NextRequest('http://localhost/api/settings/organization/plugins', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (method === 'GET') return GET(request);
  return method === 'POST' ? POST(request) : PATCH(request);
}

function archivePlugin(overrides: Record<string, unknown> = {}) {
  return { pluginKey: 'acme.tools', dependencies: [], omittedFiles: [], ...overrides };
}

describe('/api/settings/organization/plugins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.requireWorkspaceConsolePermission.mockResolvedValue(manager);
    mocks.resolveWorkspaceConsoleAccess.mockResolvedValue(manager);
    mocks.listOrganizationPlugins.mockResolvedValue([{ id: PLUGIN }]);
    mocks.listOrganizationPluginGroups.mockResolvedValue([{ id: 'g-1' }]);
  });

  describe('GET', () => {
    it('refuses a caller outside the workspace console', async () => {
      mocks.resolveWorkspaceConsoleAccess.mockRejectedValue(createError.forbidden('no'));

      const response = await call('GET');

      expect(response.status).toBe(403);
      expect(mocks.listOrganizationPlugins).not.toHaveBeenCalled();
    });

    it('lists the workspace plugins and says whether the caller can manage them', async () => {
      mocks.resolveWorkspaceConsoleAccess.mockResolvedValue({
        ...manager,
        access: { role: 'member', permissions: new Set() },
      });

      const response = await call('GET');

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(await response.json()).toEqual({
        organizationId: ORG,
        canManage: false,
        plugins: [{ id: PLUGIN }],
        groups: [{ id: 'g-1' }],
      });
      expect(mocks.listOrganizationPlugins).toHaveBeenCalledWith(mocks.neonDb, ORG);
    });
  });

  describe('POST', () => {
    it('returns the csrf refusal', async () => {
      mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

      const response = await call('POST');

      expect(response.status).toBe(403);
      expect(mocks.requireWorkspaceConsolePermission).not.toHaveBeenCalled();
    });

    it('requires policy.manage', async () => {
      mocks.requireWorkspaceConsolePermission.mockRejectedValue(createError.forbidden('no'));

      const response = await call('POST');

      expect(response.status).toBe(403);
      expect(mocks.requireWorkspaceConsolePermission).toHaveBeenCalledWith(
        expect.anything(),
        'policy.manage',
        expect.any(String),
      );
      expect(mocks.readArchiveUpload).not.toHaveBeenCalled();
    });

    it('returns the upload reader refusal', async () => {
      mocks.readArchiveUpload.mockResolvedValue(
        NextResponse.json({ error: { code: 'PLUGIN_UPLOAD_INVALID' } }, { status: 400 }),
      );

      const response = await call('POST');

      expect(response.status).toBe(400);
      expect(mocks.publishOrganizationPlugins).not.toHaveBeenCalled();
    });

    it('refuses a plugin that declares dependencies', async () => {
      mocks.readArchiveUpload.mockResolvedValue({
        archive: { plugins: [archivePlugin({ dependencies: ['other.plugin'] })] },
        acknowledgedScans: [],
        singleSkill: false,
      });

      const response = await call('POST');

      expect(response.status).toBe(422);
      expect(mocks.publishOrganizationPlugins).not.toHaveBeenCalled();
    });

    it('publishes the archive, audits each plugin and reports omitted files', async () => {
      mocks.readArchiveUpload.mockResolvedValue({
        archive: { plugins: [archivePlugin({ omittedFiles: ['big.bin'] })] },
        acknowledgedScans: ['scan-1'],
        singleSkill: true,
      });
      const published = { id: PLUGIN, pluginKey: 'acme.tools', version: '1.0.0', skills: ['a'] };
      mocks.publishOrganizationPlugins.mockResolvedValue([published]);

      const response = await call('POST');

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ plugins: [published], omittedFiles: ['big.bin'] });
      expect(mocks.readArchiveUpload).toHaveBeenCalledWith(expect.anything(), {
        acceptSingleSkill: true,
      });
      expect(mocks.publishOrganizationPlugins).toHaveBeenCalledWith(mocks.neonDb, {
        organizationId: ORG,
        actorUserId: 'admin-1',
        plugins: [archivePlugin({ omittedFiles: ['big.bin'] })],
        acknowledgedScans: ['scan-1'],
        initialPreference: 'installed_by_default',
      });
      expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
      expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          organizationId: ORG,
          eventType: 'admin_policy_changed',
          detail: expect.objectContaining({ resourceId: PLUGIN, status: 'published', count: 1 }),
        }),
      );
    });
  });

  describe('PATCH', () => {
    it('returns the csrf refusal', async () => {
      mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

      const response = await call('PATCH', { pluginId: PLUGIN, status: 'retired' });

      expect(response.status).toBe(403);
      expect(mocks.updateOrganizationPlugin).not.toHaveBeenCalled();
    });

    it.each([{ pluginId: PLUGIN }, { pluginId: 'nope', status: 'retired' }])(
      'rejects an invalid change %j',
      async (body) => {
        const response = await call('PATCH', body);

        expect(response.status).toBe(400);
        expect(mocks.updateOrganizationPlugin).not.toHaveBeenCalled();
      },
    );

    it('returns 404 for a plugin this workspace did not publish', async () => {
      mocks.updateOrganizationPlugin.mockResolvedValue(null);

      const response = await call('PATCH', { pluginId: PLUGIN, status: 'retired' });

      expect(response.status).toBe(404);
      expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    });

    it('applies the change as the admin, audits it and returns the refreshed list', async () => {
      mocks.updateOrganizationPlugin.mockResolvedValue({
        id: PLUGIN,
        pluginKey: 'acme.tools',
        status: 'retired',
        installPreference: 'available',
      });

      const response = await call('PATCH', { pluginId: PLUGIN, status: 'retired' });

      expect(response.status).toBe(200);
      expect((await response.json()).canManage).toBe(true);
      expect(mocks.updateOrganizationPlugin).toHaveBeenCalledWith(
        mocks.neonDb,
        ORG,
        { pluginId: PLUGIN, status: 'retired' },
        'admin-1',
      );
      expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG,
          detail: expect.objectContaining({ resourceId: PLUGIN, status: 'retired' }),
        }),
      );
    });
  });
});
