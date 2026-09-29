import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  assertMemoryWriteAllowed: vi.fn(),
  query: vi.fn(),
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
vi.mock('@/lib/services/memory-write-service', () => ({
  excludedMemoryMessage: vi.fn(),
  partitionMemoryWrites: vi.fn(),
  assertMemoryWriteAllowed: mocks.assertMemoryWriteAllowed,
}));
vi.mock('@/lib/services/managed-memory-context-service', () => ({
  AUTO_MEMORY_SOURCE: 'auto',
  CLOSED_ORGANIZATION_MEMORY_POLICY: vi.fn(),
  DISABLED_MANAGED_MEMORY_POLICY: vi.fn(),
  GLOBAL_MEMORY_SCOPE: vi.fn(),
  MAX_MEMORY_EXCLUSIONS: 50,
  MAX_MEMORY_EXPIRY_DAYS: 3650,
  MEMORY_INELIGIBILITY_REASONS: vi.fn(),
  MEMORY_RETENTION_CLASSES: vi.fn(),
  MEMORY_SOURCES: vi.fn(),
  MIN_MEMORY_EXCLUSION_LENGTH: 3,
  MemoryIneligibleError: class MemoryIneligibleError extends Error {},
  UNGOVERNED_MEMORY_POLICY: vi.fn(),
  applyManagedMemoryContext: vi.fn(),
  clampMemoryExpiryToRetention: vi.fn(),
  consolidateMemories: vi.fn(),
  formatManagedMemorySystemPrompt: vi.fn(),
  isMemoryExcluded: vi.fn(),
  loadManagedMemoryContext: vi.fn(),
  loadManagedMemoryPolicy: vi.fn(),
  loadMemoryExclusions: vi.fn(),
  loadMemoryWritePolicies: vi.fn(),
  loadOrganizationContextPolicy: vi.fn(),
  loadOrganizationMemoryPolicy: vi.fn(),
  loadProjectMemoryScope: vi.fn(),
  loadSuppressedMemorySources: vi.fn(),
  managedMemoryContextLoader: vi.fn(),
  matchedMemoryExclusion: vi.fn(),
  memoryContentRefusal: vi.fn(),
  memoryEligibilityGate: vi.fn(),
  memoryProvenance: vi.fn(),
  memoryRetentionClass: vi.fn(),
  memoryWriteAdmission: vi.fn(),
  normalizeMemoryExclusions: vi.fn(),
  normalizeSuppressedMemorySources: vi.fn(),
  organizationAllowsMemory: vi.fn(),
  organizationMemoryGate: vi.fn(),
  parseMemoryExpiry: vi.fn(),
  persistManagedAutoMemoryFacts: vi.fn(),
  rankMemoriesByRelevance: vi.fn(),
  readUserMemoryCapabilities: vi.fn(),
  sweepExpiredMemories: vi.fn(),
  writeConsolidatedMemory: vi.fn(),
  activeMemoryPredicate: () => 'true',
  unexpiredMemoryPredicate: () => 'true',
  workspaceMemoryPredicate: () => 'true',
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

const MEMORY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEPT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function request(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/memory/${MEMORY}/restore`, { method: 'POST' });
}

function context(id = MEMORY) {
  return { params: Promise.resolve({ id }) };
}

describe('/api/memory/[id]/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({
      db: { query: mocks.query },
      userId: 'user-1',
      organizationId: 'org-1',
    });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.assertMemoryWriteAllowed.mockResolvedValue(undefined);
  });

  it('refuses a request that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await POST(request(), context());
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a uuid', async () => {
    const response = await POST(request(), context('memory-1'));
    expect(response.status).toBe(400);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await POST(request(), context());
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('answers 404 when the memory is not the caller or is deleted', async () => {
    mocks.query.mockResolvedValueOnce([]);
    const response = await POST(request(), context());
    expect(response.status).toBe(404);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([MEMORY, 'user-1', 'org-1']);
    expect(mocks.assertMemoryWriteAllowed).not.toHaveBeenCalled();
  });

  it('does not swap when the write policy refuses the content', async () => {
    mocks.query.mockResolvedValueOnce([{ content: 'blocked content' }]);
    mocks.assertMemoryWriteAllowed.mockRejectedValue(createError.forbidden('blocked'));
    const response = await POST(request(), context());
    expect(response.status).toBe(403);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it('answers 404 when there is nothing left to swap', async () => {
    mocks.query
      .mockResolvedValueOnce([{ content: 'likes tea' }])
      .mockResolvedValueOnce([{ restored: null, replaced: null }]);
    const response = await POST(request(), context());
    expect(response.status).toBe(404);
  });

  it('restores the replaced memory and demotes the one that replaced it', async () => {
    mocks.query
      .mockResolvedValueOnce([{ content: 'likes tea' }])
      .mockResolvedValueOnce([{ restored: MEMORY, replaced: KEPT }]);
    const response = await POST(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ restoredId: MEMORY, replacedId: KEPT });
    expect(mocks.assertMemoryWriteAllowed).toHaveBeenCalledWith(
      { query: mocks.query },
      { userId: 'user-1', content: 'likes tea' },
    );
    expect(mocks.query.mock.calls[1]?.[1]).toEqual([MEMORY, 'user-1', 'org-1']);
  });
});
