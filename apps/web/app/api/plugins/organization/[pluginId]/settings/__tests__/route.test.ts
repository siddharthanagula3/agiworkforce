import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  getUserScopedDb: vi.fn(),
  listMemberOrganizationPlugins: vi.fn(),
  updateMemberOrganizationPlugin: vi.fn(),
  recordWorkspaceAuditEvent: vi.fn(),
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
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/workspace-audit', () => ({
  recordWorkspaceAuditEvent: mocks.recordWorkspaceAuditEvent,
}));
vi.mock('@/lib/services/organization-plugin-service', () => ({
  isMissingOrganizationPluginSchema: vi.fn(),
  listOrganizationPluginGroups: vi.fn(),
  listOrganizationPluginSkillFiles: vi.fn(),
  listOrganizationPlugins: vi.fn(),
  listOrganizationSkillCompanions: vi.fn(),
  publishOrganizationPlugins: vi.fn(),
  readOrganizationPluginFile: vi.fn(),
  updateOrganizationPlugin: vi.fn(),
  listMemberOrganizationPlugins: mocks.listMemberOrganizationPlugins,
  updateMemberOrganizationPlugin: mocks.updateMemberOrganizationPlugin,
}));

import { GET, PATCH } from '../route';

const PLUGIN = '44444444-4444-4444-8444-444444444444';
const ORG = '11111111-1111-4111-8111-111111111111';
const db = { query: vi.fn() };

function call(method: 'GET' | 'PATCH', pluginId: string, body?: unknown) {
  const request = new NextRequest(
    `http://localhost/api/plugins/organization/${pluginId}/settings`,
    {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  const context = { params: Promise.resolve({ pluginId }) };
  return method === 'GET' ? GET(request, context) : PATCH(request, context);
}

const installed = {
  id: PLUGIN,
  pluginKey: 'acme.tools',
  installed: true,
  skills: ['draft', 'review'],
  enabledSkills: null,
};

describe('/api/plugins/organization/[pluginId]/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: ORG });
  });

  describe('GET', () => {
    it('returns 401 when the caller is not signed in', async () => {
      mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

      const response = await call('GET', PLUGIN);

      expect(response.status).toBe(401);
    });

    it('returns 404 when the caller has no workspace', async () => {
      mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });

      const response = await call('GET', PLUGIN);

      expect(response.status).toBe(404);
      expect(mocks.listMemberOrganizationPlugins).not.toHaveBeenCalled();
    });

    it('returns 404 for a non-uuid id', async () => {
      const response = await call('GET', 'nope');

      expect(response.status).toBe(404);
      expect(mocks.listMemberOrganizationPlugins).not.toHaveBeenCalled();
    });

    it('falls back to every skill when no subset is enabled', async () => {
      mocks.listMemberOrganizationPlugins.mockResolvedValue([installed]);

      const response = await call('GET', PLUGIN);

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(await response.json()).toEqual({
        settings: {
          pluginId: PLUGIN,
          enabledSkills: ['draft', 'review'],
          examplePrompts: [],
          connectors: [],
          agents: [],
        },
      });
      expect(mocks.listMemberOrganizationPlugins).toHaveBeenCalledWith(db, 'user-1', ORG);
    });
  });

  describe('PATCH', () => {
    it('returns the csrf refusal before authenticating', async () => {
      mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

      const response = await call('PATCH', PLUGIN, { enabledSkills: ['draft'] });

      expect(response.status).toBe(403);
      expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    });

    it('refuses to let a member set workspace example prompts', async () => {
      const response = await call('PATCH', PLUGIN, { customExamplePrompts: ['hi'] });

      expect(response.status).toBe(400);
      expect(mocks.updateMemberOrganizationPlugin).not.toHaveBeenCalled();
    });

    it('returns 404 and records nothing when the plugin is not installed', async () => {
      mocks.updateMemberOrganizationPlugin.mockResolvedValue({ ...installed, installed: false });

      const response = await call('PATCH', PLUGIN, { enabledSkills: ['draft'] });

      expect(response.status).toBe(404);
      expect(mocks.recordWorkspaceAuditEvent).not.toHaveBeenCalled();
    });

    it('updates the caller enabled skills in their workspace and records it', async () => {
      mocks.updateMemberOrganizationPlugin.mockResolvedValue({
        ...installed,
        enabledSkills: ['draft'],
      });

      const response = await call('PATCH', PLUGIN, { enabledSkills: ['draft'] });

      expect(response.status).toBe(200);
      expect((await response.json()).settings.enabledSkills).toEqual(['draft']);
      expect(mocks.updateMemberOrganizationPlugin).toHaveBeenCalledWith(db, 'user-1', ORG, PLUGIN, {
        enabledSkills: ['draft'],
      });
      expect(mocks.recordWorkspaceAuditEvent).toHaveBeenCalledWith(
        db,
        expect.anything(),
        expect.objectContaining({
          userId: 'user-1',
          eventType: 'plugin_setting_changed',
          detail: expect.objectContaining({ resourceId: PLUGIN, source: 'workspace', count: 1 }),
        }),
      );
    });
  });
});
