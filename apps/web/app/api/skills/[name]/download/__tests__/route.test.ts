import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  listPermittedPluginIds: vi.fn(),
  getDownload: vi.fn(),
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
vi.mock('@/lib/services/workspace-plugin-access', () => ({
  workspaceAllowsPlugins: vi.fn(),
  listPermittedPluginIds: mocks.listPermittedPluginIds,
}));
vi.mock('@/lib/services/skill-catalog-service', () => ({
  SKILL_REQUIREMENTS_UNMET_CODE: 'skill_requirements_unmet',
  SkillCatalogUnavailableError: class SkillCatalogUnavailableError extends Error {},
  dedupeByFirstClaimedName: vi.fn(),
  executeManagedSkillTool: vi.fn(),
  executeManagedSkillToolForPlugins: vi.fn(),
  filterSkillsByInstallOverrides: vi.fn(),
  findManagedDirectorySkillByName: vi.fn(),
  findManagedSkillByName: vi.fn(),
  findManagedSkillWithFiles: vi.fn(),
  findSelectableSkillByName: vi.fn(),
  findSelectableSkillWithFiles: vi.fn(),
  getBundledSkillDownload: vi.fn(),
  getManagedSkillCatalog: vi.fn(),
  getManagedSkillCatalogForPlugins: vi.fn(),
  getManagedSkillDirectory: vi.fn(),
  getManagedSkillDirectoryForPlugins: vi.fn(),
  getManagedSkillLayers: vi.fn(),
  getManagedSkillPluginOwners: vi.fn(),
  invalidateManagedSkillCatalogCache: vi.fn(),
  isDraftSkill: vi.fn(),
  isPluginOwnedSkill: vi.fn(),
  listManagedPluginSkillsWithFiles: vi.fn(),
  listManagedSkillFiles: vi.fn(),
  loadSelectableSkillCatalog: vi.fn(),
  memoizeAsync: vi.fn(),
  parseSkillLayersConfig: vi.fn(),
  readManagedSkillFile: vi.fn(),
  readManagedSkillFileBytes: vi.fn(),
  resetManagedSkillCatalogCacheForTests: vi.fn(),
  selectedSkillRequirementFailure: vi.fn(),
  skillRequiredTools: vi.fn(),
  withoutDraftSkills: vi.fn(),
  getBundledSkillDownloadForPlugins: mocks.getDownload,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const DB = { query: vi.fn() };

function call(name: string) {
  return GET(new NextRequest(`http://localhost/api/skills/${name}/download`) as never, {
    params: Promise.resolve({ name }),
  });
}

describe('GET /api/skills/[name]/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({ db: DB, userId: 'user-1' });
    mocks.listPermittedPluginIds.mockResolvedValue(new Set(['plugin-a']));
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await call('pdf');
    expect(response.status).toBe(401);
    expect(mocks.getDownload).not.toHaveBeenCalled();
  });

  it('returns the rate limit response', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({}, { status: 429 }));
    const response = await call('pdf');
    expect(response.status).toBe(429);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('rejects an overlong name', async () => {
    const response = await call('a'.repeat(201));
    expect(response.status).toBe(400);
    expect(mocks.getDownload).not.toHaveBeenCalled();
  });

  it('returns 404 for a skill outside the permitted plugins', async () => {
    mocks.getDownload.mockResolvedValue(null);
    const response = await call('pdf');
    expect(response.status).toBe(404);
  });

  it('downloads the skill resolved against the caller plugins', async () => {
    mocks.getDownload.mockResolvedValue({
      content: Buffer.from('# PDF skill', 'utf8'),
      contentHash: 'hash-1',
    });
    const response = await call('pdf');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="SKILL.md"');
    expect(response.headers.get('etag')).toBe('"hash-1"');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.text()).resolves.toBe('# PDF skill');
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(mocks.listPermittedPluginIds).toHaveBeenCalledWith(DB, 'user-1');
    expect(mocks.getDownload).toHaveBeenCalledWith(new Set(['plugin-a']), 'pdf');
  });
});
