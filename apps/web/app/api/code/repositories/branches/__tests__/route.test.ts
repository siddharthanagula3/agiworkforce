import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getPlanMaxSandboxes } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  e2bProvisioningReady: vi.fn(),
  resolveEntitledPlanTier: vi.fn(),
  getUserGithubInstallations: vi.fn(),
  assertRepositoryIsVerified: vi.fn(),
  getInstallationAccessToken: vi.fn(),
  listGitHubRepositoryBranches: vi.fn(),
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
vi.mock('@/lib/e2b/gate', () => ({
  E2B_API_KEY_ENV: 'E2B_API_KEY',
  E2B_EXECUTION_ENV: 'AGI_E2B_EXECUTION',
  e2bCutoverEnabled: vi.fn(),
  e2bExecutionEnabled: vi.fn(),
  managedComputeBetaEnabled: vi.fn(),
  e2bProvisioningReady: mocks.e2bProvisioningReady,
}));
vi.mock('@/lib/services/entitlement-resolution', () => ({
  ensureSeatMemberCreditAccount: vi.fn(),
  isSeatBearingBillingPlan: vi.fn(),
  resolveEffectiveSubscription: vi.fn(),
  resolveEntitlementBundle: vi.fn(),
  resolveEntitledPlanTier: mocks.resolveEntitledPlanTier,
}));
vi.mock('@/lib/user-connector-tools', () => ({
  ConnectorCredentialError: class ConnectorCredentialError extends Error {},
  MAX_CONNECTOR_TOOLS_PER_USER: 32,
  __resetConnectorMcpMapCacheForTests: vi.fn(),
  evictConnectorOAuthCaches: vi.fn(),
  evictCustomConnectorCaches: vi.fn(),
  evictOrgSharedConnectorCaches: vi.fn(),
  findUserCustomConnectorByServerId: vi.fn(),
  findUserCustomConnectorByUrl: vi.fn(),
  getOperatorMappedConnectorIds: vi.fn(),
  getUserCustomConnectorSummaries: vi.fn(),
  loadUserConnectorCapabilityCatalog: vi.fn(),
  loadUserConnectorToolCatalog: vi.fn(),
  loadUserConnectorToolDefs: vi.fn(),
  makeUserConnectorExecutor: vi.fn(),
  researchConnectorSources: vi.fn(),
  withUserConnectorMcpHandle: vi.fn(),
  getUserGithubInstallations: mocks.getUserGithubInstallations,
}));
vi.mock('@/lib/github-app', () => ({
  GITHUB_WEBHOOK_SECRET: vi.fn(),
  GitHubAuthorizationRevokedError: class GitHubAuthorizationRevokedError extends Error {},
  GitHubPullRequestError: class GitHubPullRequestError extends Error {},
  GitHubWriteOutcomeUnknownError: class GitHubWriteOutcomeUnknownError extends Error {},
  addGitHubIssueAssignees: vi.fn(),
  addGitHubIssueLabels: vi.fn(),
  buildPullRequestBody: vi.fn(),
  createGitHubPullRequest: vi.fn(),
  deleteGitHubAppInstallation: vi.fn(),
  exchangeGitHubOAuthCode: vi.fn(),
  findGitHubInstallationForUser: vi.fn(),
  findOpenGitHubPullRequest: vi.fn(),
  generateGitHubInstallState: vi.fn(),
  getGitHubAppInstallUrl: vi.fn(),
  getGitHubAppJwt: vi.fn(),
  getGitHubIssue: vi.fn(),
  getGitHubPullRequestForTask: vi.fn(),
  getGitHubPullRequestStatus: vi.fn(),
  getGitHubRepositoryDefaultBranch: vi.fn(),
  getGitHubUserAuthorizationUrl: vi.fn(),
  getPrDiff: vi.fn(),
  isGitHubAppConfigured: vi.fn(),
  isGitHubInstallationLinkingAvailable: vi.fn(),
  issueCommentPostedSince: vi.fn(),
  listGitHubFailedChecks: vi.fn(),
  listGitHubIssueCommentBodies: vi.fn(),
  listGitHubIssues: vi.fn(),
  listInstallationRepositories: vi.fn(),
  listPrReviewCommentBodies: vi.fn(),
  missingGitHubInstallationLinkingVars: vi.fn(),
  parseLinkedIssues: vi.fn(),
  postIssueComment: vi.fn(),
  postPrReview: vi.fn(),
  pullRequestReviewPostedSince: vi.fn(),
  requestGitHubPullRequestReviewers: vi.fn(),
  setGitHubPullRequestDraft: vi.fn(),
  updateGitHubPullRequest: vi.fn(),
  verifyGitHubWebhookSignature: vi.fn(),
  GitHubInstallationUnverifiedError: class GitHubInstallationUnverifiedError extends Error {},
  assertRepositoryIsVerified: mocks.assertRepositoryIsVerified,
  getInstallationAccessToken: mocks.getInstallationAccessToken,
  listGitHubRepositoryBranches: mocks.listGitHubRepositoryBranches,
}));

import { createError } from '@/lib/errors';
import { GitHubInstallationUnverifiedError } from '@/lib/github-app';
import { GET } from '../route';

const INSTALLATION = {
  installationId: 42,
  verifiedRepositories: ['acme/app'],
};
const LISTED = { branches: [{ name: 'main' }, { name: 'feat' }], truncated: false };

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/code/repositories/branches${query}`);
}

const VALID = '?installationId=42&repository=acme/app';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db: mocks.db, userId: 'user-1' });
  mocks.e2bProvisioningReady.mockReturnValue(true);
  mocks.resolveEntitledPlanTier.mockResolvedValue('pro');
  mocks.getUserGithubInstallations.mockResolvedValue([INSTALLATION]);
  mocks.assertRepositoryIsVerified.mockReturnValue(undefined);
  mocks.getInstallationAccessToken.mockResolvedValue('ghs_token');
  mocks.listGitHubRepositoryBranches.mockResolvedValue(LISTED);
});

describe('GET /api/code/repositories/branches', () => {
  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await GET(request(VALID));

    expect(response.status).toBe(401);
    expect(mocks.getUserGithubInstallations).not.toHaveBeenCalled();
  });

  it.each([
    '?repository=acme/app',
    '?installationId=-1&repository=acme/app',
    '?installationId=42',
    '?installationId=42&repository=acme',
  ])('rejects bad query %s', async (query) => {
    const response = await GET(request(query));

    expect(response.status).toBe(400);
    expect(mocks.getUserGithubInstallations).not.toHaveBeenCalled();
  });

  it('answers 503 when managed Code is not enabled', async () => {
    mocks.e2bProvisioningReady.mockReturnValue(false);

    const response = await GET(request(VALID));

    expect(response.status).toBe(503);
    expect(mocks.resolveEntitledPlanTier).not.toHaveBeenCalled();
  });

  it('refuses a plan without managed Code sessions', async () => {
    expect(getPlanMaxSandboxes('byok')).toBe(0);
    mocks.resolveEntitledPlanTier.mockResolvedValue('byok');

    const response = await GET(request(VALID));

    expect(response.status).toBe(503);
    expect(mocks.getUserGithubInstallations).not.toHaveBeenCalled();
  });

  it("answers 404 for an installation that is not the caller's", async () => {
    const response = await GET(request('?installationId=99&repository=acme/app'));

    expect(response.status).toBe(404);
    expect(mocks.getInstallationAccessToken).not.toHaveBeenCalled();
  });

  it('refuses a repository the installation has not proved access to', async () => {
    mocks.assertRepositoryIsVerified.mockImplementation(() => {
      throw new Error('not verified');
    });

    const response = await GET(request('?installationId=42&repository=other/repo'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain('Choose a repository from the list');
    expect(mocks.getInstallationAccessToken).not.toHaveBeenCalled();
  });

  it('asks for a reconnect when the installation predates verification', async () => {
    mocks.assertRepositoryIsVerified.mockImplementation(() => {
      throw new GitHubInstallationUnverifiedError(42);
    });

    const response = await GET(request(VALID));

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain('Reconnect GitHub');
  });

  it('answers 503 when GitHub does not answer', async () => {
    mocks.listGitHubRepositoryBranches.mockRejectedValue(new Error('timeout'));

    const response = await GET(request(VALID));

    expect(response.status).toBe(503);
  });

  it('lists branches with a metadata-only token scoped to the repository', async () => {
    expect(getPlanMaxSandboxes('pro')).toBeGreaterThan(0);

    const response = await GET(request(VALID));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(LISTED);
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(mocks.resolveEntitledPlanTier).toHaveBeenCalledWith(mocks.db, 'user-1');
    expect(mocks.getUserGithubInstallations).toHaveBeenCalledWith('user-1');
    expect(mocks.assertRepositoryIsVerified).toHaveBeenCalledWith(42, ['acme/app'], 'acme/app');
    expect(mocks.getInstallationAccessToken).toHaveBeenCalledWith(42, {
      repositories: ['app'],
      permissions: { metadata: 'read' },
    });
    expect(mocks.listGitHubRepositoryBranches).toHaveBeenCalledWith('ghs_token', 'acme', 'app', {
      perPage: 100,
      maxPages: 10,
      maxItems: 1000,
    });
  });
});
