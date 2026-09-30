import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  isCloudCodeSchemaUnavailable: vi.fn(),
  openSharedCloudCodeSession: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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
vi.mock('@/lib/server/rls-db', () => ({
  ACTIVE_ORG_HEADER: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  getVerifiedBearerUserScopedDb: vi.fn(),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/services/cloud-code-session-service', () => ({
  CLOUD_CODE_RUN_LEASE_SECONDS: 420,
  CLOUD_CODE_WORKING_BRANCH_PREFIX: 'agi/',
  CloudCodeConflictError: class CloudCodeConflictError extends Error {},
  CloudCodeLimitError: class CloudCodeLimitError extends Error {},
  CloudCodeNotFoundError: class CloudCodeNotFoundError extends Error {},
  CloudCodeUnavailableError: class CloudCodeUnavailableError extends Error {},
  CloudCodeValidationError: class CloudCodeValidationError extends Error {},
  agentStepLabel: vi.fn(),
  asCloudCodeSessionStatusFilter: vi.fn(),
  claimCloudCodeSessionForRun: vi.fn(),
  classifyGitFailure: vi.fn(),
  closeCloudCodeSession: vi.fn(),
  cloudCodeSessionBaseBranch: vi.fn(),
  cloudCodeWorkingBranchName: vi.fn(),
  commitAndPushCloudCodeSession: vi.fn(),
  createCloudCodeSession: vi.fn(),
  deleteCloudCodeSession: vi.fn(),
  discardCloudCodeSessionChanges: vi.fn(),
  getCloudCodeSession: vi.fn(),
  listCloudCodeAgentTurns: vi.fn(),
  listCloudCodeNotebookFiles: vi.fn(),
  listCloudCodeSessions: vi.fn(),
  listCloudCodeTerminalEntries: vi.fn(),
  mapCloudCodeSession: vi.fn(),
  mapCloudCodeTerminalEntry: vi.fn(),
  openCloudCodeSessionPullRequest: vi.fn(),
  parseGitPorcelainStatus: vi.fn(),
  readCloudCodeNotebookFile: vi.fn(),
  readCloudCodeSessionChanges: vi.fn(),
  readCloudCodeSessionContinuation: vi.fn(),
  readCloudCodeSessionPullRequestStatus: vi.fn(),
  readCloudCodeSessionResult: vi.fn(),
  releaseCloudCodeSessionAfterRun: vi.fn(),
  renameCloudCodeSession: vi.fn(),
  resolveCloudCodeSessionOwnerOrganizationId: vi.fn(),
  runCloudCodeCommand: vi.fn(),
  runCloudCodeNotebookCell: vi.fn(),
  setCloudCodeSessionArchived: vi.fn(),
  validateCloudCodeSessionId: vi.fn(),
  validateCreateCloudCodeSession: vi.fn(),
  writeCloudCodeNotebookFile: vi.fn(),
  isCloudCodeSchemaUnavailable: mocks.isCloudCodeSchemaUnavailable,
}));
vi.mock('@/lib/services/cloud-code-session-sharing', () => ({
  CloudCodeSharingForbiddenError: class CloudCodeSharingForbiddenError extends Error {},
  setCloudCodeSessionSharing: vi.fn(),
  CloudCodeSharedRepositoryError: class CloudCodeSharedRepositoryError extends Error {},
  openSharedCloudCodeSession: mocks.openSharedCloudCodeSession,
}));

import { createError } from '@/lib/errors';
import { CloudCodeSharedRepositoryError } from '@/lib/services/cloud-code-session-sharing';
import { GET } from '../route';

const TOKEN = 'share-token-1';
const SHARED = { sessionId: 'session-1', title: 'Fix the build', transcript: [] };

function call() {
  return GET(new NextRequest(`http://localhost/api/code/shared/${TOKEN}`), {
    params: Promise.resolve({ token: TOKEN }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db: mocks.db, userId: 'viewer-1' });
  mocks.isCloudCodeSchemaUnavailable.mockReturnValue(false);
  mocks.openSharedCloudCodeSession.mockResolvedValue(SHARED);
});

describe('GET /api/code/shared/[token]', () => {
  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await call();

    expect(response.status).toBe(401);
    expect(mocks.openSharedCloudCodeSession).not.toHaveBeenCalled();
  });

  it('rate limits share views per user', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await call();

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'share-view',
      'user:viewer-1',
    );
  });

  it('answers 404 when the share is gone', async () => {
    mocks.openSharedCloudCodeSession.mockResolvedValue(null);

    const response = await call();

    expect(response.status).toBe(404);
  });

  it('answers 403 when the viewer cannot read the repository', async () => {
    mocks.openSharedCloudCodeSession.mockRejectedValue(
      new CloudCodeSharedRepositoryError('You need access to acme/app'),
    );

    const response = await call();

    expect(response.status).toBe(403);
  });

  it('answers 503 while the cloud schema is not deployed', async () => {
    mocks.openSharedCloudCodeSession.mockRejectedValue(new Error('relation missing'));
    mocks.isCloudCodeSchemaUnavailable.mockReturnValue(true);

    const response = await call();

    expect(response.status).toBe(503);
  });

  it('opens the shared session for the viewer', async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(SHARED);
    expect(mocks.openSharedCloudCodeSession).toHaveBeenCalledWith(mocks.db, 'viewer-1', TOKEN);
  });
});
