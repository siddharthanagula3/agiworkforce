import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  getUserScopedDb: vi.fn(),
  listCommunityPlugins: vi.fn(),
  updateCommunityInstall: vi.fn(),
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
vi.mock('@/lib/services/plugin-submission-service', () => ({
  createSubmission: vi.fn(),
  decideSubmission: vi.fn(),
  isMissingPluginSubmissionSchema: vi.fn(),
  listCommunitySkillCompanions: vi.fn(),
  listCommunitySkillFiles: vi.fn(),
  listInstalledCommunityPlugins: vi.fn(),
  listSubmissionsForReview: vi.fn(),
  listUserSubmissions: vi.fn(),
  readCommunityPluginFile: vi.fn(),
  readSubmissionForReview: vi.fn(),
  withdrawSubmission: vi.fn(),
  listCommunityPlugins: mocks.listCommunityPlugins,
  updateCommunityInstall: mocks.updateCommunityInstall,
}));

import { GET, PATCH } from '../route';

const PLUGIN = '44444444-4444-4444-8444-444444444444';
const db = { query: vi.fn() };

function call(method: 'GET' | 'PATCH', id: string, body?: unknown) {
  const request = new NextRequest(`http://localhost/api/plugins/community/${id}/settings`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const context = { params: Promise.resolve({ id }) };
  return method === 'GET' ? GET(request, context) : PATCH(request, context);
}

const installed = {
  id: PLUGIN,
  pluginKey: 'acme.tools',
  installed: true,
  skills: ['draft', 'review'],
  enabledSkills: ['draft'],
};

describe('/api/plugins/community/[id]/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
  });

  describe('GET', () => {
    it('returns 401 when the caller is not signed in', async () => {
      mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

      const response = await call('GET', PLUGIN);

      expect(response.status).toBe(401);
    });

    it('returns 404 for a non-uuid id', async () => {
      const response = await call('GET', 'nope');

      expect(response.status).toBe(404);
      expect(mocks.listCommunityPlugins).not.toHaveBeenCalled();
    });

    it('returns 404 when the plugin is listed but not installed', async () => {
      mocks.listCommunityPlugins.mockResolvedValue([{ ...installed, installed: false }]);

      const response = await call('GET', PLUGIN);

      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe('PLUGIN_NOT_INSTALLED');
    });

    it('returns the caller settings for an installed plugin', async () => {
      mocks.listCommunityPlugins.mockResolvedValue([installed]);

      const response = await call('GET', PLUGIN);

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(await response.json()).toEqual({
        settings: {
          pluginId: PLUGIN,
          enabledSkills: ['draft'],
          examplePrompts: [],
          connectors: [],
          agents: [],
        },
      });
      expect(mocks.listCommunityPlugins).toHaveBeenCalledWith(db, 'user-1');
    });
  });

  describe('PATCH', () => {
    it('returns the csrf refusal before authenticating', async () => {
      mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

      const response = await call('PATCH', PLUGIN, { enabledSkills: ['draft'] });

      expect(response.status).toBe(403);
      expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
    });

    it('rejects an unknown field with 400', async () => {
      const response = await call('PATCH', PLUGIN, { surprise: true });

      expect(response.status).toBe(400);
      expect(mocks.updateCommunityInstall).not.toHaveBeenCalled();
    });

    it('refuses to let a member set publisher example prompts', async () => {
      const response = await call('PATCH', PLUGIN, { customExamplePrompts: ['hi'] });

      expect(response.status).toBe(400);
      expect(mocks.updateCommunityInstall).not.toHaveBeenCalled();
    });

    it('returns 404 and records nothing when the install is missing', async () => {
      mocks.updateCommunityInstall.mockResolvedValue(null);

      const response = await call('PATCH', PLUGIN, { enabledSkills: ['draft'] });

      expect(response.status).toBe(404);
      expect(mocks.recordWorkspaceAuditEvent).not.toHaveBeenCalled();
    });

    it('updates the enabled skills and records the change', async () => {
      mocks.updateCommunityInstall.mockResolvedValue({ ...installed, enabledSkills: ['review'] });

      const response = await call('PATCH', PLUGIN, { enabledSkills: ['review'] });

      expect(response.status).toBe(200);
      expect((await response.json()).settings.enabledSkills).toEqual(['review']);
      expect(mocks.updateCommunityInstall).toHaveBeenCalledWith(db, 'user-1', PLUGIN, {
        enabledSkills: ['review'],
      });
      expect(mocks.recordWorkspaceAuditEvent).toHaveBeenCalledWith(
        db,
        expect.anything(),
        expect.objectContaining({
          userId: 'user-1',
          eventType: 'plugin_setting_changed',
          detail: expect.objectContaining({ resourceId: PLUGIN, source: 'community', count: 1 }),
        }),
      );
    });
  });
});
