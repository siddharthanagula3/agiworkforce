import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  readCloudCodeSessionPullRequestStatus: vi.fn(),
  isCloudCodeSchemaUnavailable: vi.fn(),
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
  CloudCodeNotFoundError: class CloudCodeNotFoundError extends Error {},
  CloudCodeUnavailableError: class CloudCodeUnavailableError extends Error {},
  CloudCodeValidationError: class CloudCodeValidationError extends Error {},
  isCloudCodeSchemaUnavailable: mocks.isCloudCodeSchemaUnavailable,
  readCloudCodeSessionPullRequestStatus: mocks.readCloudCodeSessionPullRequestStatus,
}));

import { createError } from '@/lib/errors';
import {
  CloudCodeNotFoundError,
  CloudCodeUnavailableError,
  CloudCodeValidationError,
} from '@/lib/services/cloud-code-session-service';
import { GET } from '../route';

const SESSION = 'session-1';
const STATUS = { url: 'https://github.com/acme/app/pull/7', state: 'open', checks: 'passing' };

function call() {
  return GET(new NextRequest(`http://localhost/api/code/sessions/${SESSION}/pull-request/status`), {
    params: Promise.resolve({ sessionId: SESSION }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({
    db: mocks.db,
    userId: 'user-1',
    organizationId: 'org-1',
  });
  mocks.isCloudCodeSchemaUnavailable.mockReturnValue(false);
  mocks.readCloudCodeSessionPullRequestStatus.mockResolvedValue(STATUS);
});

describe('GET /api/code/sessions/[sessionId]/pull-request/status', () => {
  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await call();

    expect(response.status).toBe(401);
    expect(mocks.readCloudCodeSessionPullRequestStatus).not.toHaveBeenCalled();
  });

  it('rate limits per user', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await call();

    expect(response.status).toBe(429);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'chat-conversation',
      'user:user-1',
    );
  });

  it.each([
    [new CloudCodeValidationError('bad id'), 400],
    [new CloudCodeNotFoundError(), 404],
    [new CloudCodeUnavailableError('down'), 503],
  ])('maps %s to %i', async (error, status) => {
    mocks.readCloudCodeSessionPullRequestStatus.mockRejectedValue(error);

    const response = await call();

    expect(response.status).toBe(status);
  });

  it('answers 503 while the cloud schema is not deployed', async () => {
    mocks.readCloudCodeSessionPullRequestStatus.mockRejectedValue(new Error('relation missing'));
    mocks.isCloudCodeSchemaUnavailable.mockReturnValue(true);

    const response = await call();

    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toContain('Managed Code is coming soon');
  });

  it('returns the status scoped to the caller and organization', async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(STATUS);
    expect(mocks.readCloudCodeSessionPullRequestStatus).toHaveBeenCalledWith(
      mocks.db,
      { userId: 'user-1', organizationId: 'org-1' },
      SESSION,
    );
  });
});
