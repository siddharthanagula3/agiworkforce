import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  isGitHubAppConfigured: vi.fn(),
  isGitHubInstallationLinkingAvailable: vi.fn(),
  recordAuditEvent: vi.fn(),
  openLocalPullRequest: vi.fn(),
  readLocalPullRequest: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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
vi.mock('@/lib/github-app', () => ({
  GITHUB_WEBHOOK_SECRET: vi.fn(),
  GitHubAuthorizationRevokedError: class GitHubAuthorizationRevokedError extends Error {},
  GitHubInstallationUnverifiedError: class GitHubInstallationUnverifiedError extends Error {},
  GitHubPullRequestError: class GitHubPullRequestError extends Error {},
  GitHubWriteOutcomeUnknownError: class GitHubWriteOutcomeUnknownError extends Error {},
  addGitHubIssueAssignees: vi.fn(),
  addGitHubIssueLabels: vi.fn(),
  assertRepositoryIsVerified: vi.fn(),
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
  getInstallationAccessToken: vi.fn(),
  getPrDiff: vi.fn(),
  issueCommentPostedSince: vi.fn(),
  listGitHubFailedChecks: vi.fn(),
  listGitHubIssueCommentBodies: vi.fn(),
  listGitHubIssues: vi.fn(),
  listGitHubRepositoryBranches: vi.fn(),
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
  isGitHubAppConfigured: mocks.isGitHubAppConfigured,
  isGitHubInstallationLinkingAvailable: mocks.isGitHubInstallationLinkingAvailable,
}));
vi.mock('@/lib/services/cloud-code-local-pull-request', () => ({
  LocalPullRequestError: class LocalPullRequestError extends Error {},
  openLocalPullRequest: mocks.openLocalPullRequest,
  readLocalPullRequest: mocks.readLocalPullRequest,
}));

import { createError } from '@/lib/errors';
import { LocalPullRequestError } from '@/lib/services/cloud-code-local-pull-request';
import { GET, POST } from '../route';

const REMOTE = 'https://github.com/acme/app.git';
const PULL_REQUEST = { url: 'https://github.com/acme/app/pull/7', number: 7, state: 'open' };

function getRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/code/local-pull-requests${query}`);
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/code/local-pull-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1' });
  mocks.isGitHubAppConfigured.mockReturnValue(true);
  mocks.isGitHubInstallationLinkingAvailable.mockReturnValue(true);
  mocks.readLocalPullRequest.mockResolvedValue({ pullRequest: PULL_REQUEST });
  mocks.openLocalPullRequest.mockResolvedValue(PULL_REQUEST);
});

describe('GET /api/code/local-pull-requests', () => {
  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await GET(getRequest('?remoteUrl=x'));

    expect(response.status).toBe(401);
    expect(mocks.readLocalPullRequest).not.toHaveBeenCalled();
  });

  it('answers 503 when the deployment has no GitHub App', async () => {
    mocks.isGitHubAppConfigured.mockReturnValue(false);

    const response = await GET(getRequest('?remoteUrl=x'));

    expect(response.status).toBe(503);
    expect(mocks.readLocalPullRequest).not.toHaveBeenCalled();
  });

  it('maps a service validation error to 400', async () => {
    mocks.readLocalPullRequest.mockRejectedValue(new LocalPullRequestError('Bad remote'));

    const response = await GET(getRequest('?remoteUrl=nope'));

    expect(response.status).toBe(400);
  });

  it('reads the pull request for the caller', async () => {
    const response = await GET(
      getRequest(`?remoteUrl=${encodeURIComponent(REMOTE)}&head=feat&base=main`),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pullRequest: PULL_REQUEST });
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(mocks.readLocalPullRequest).toHaveBeenCalledWith('user-1', REMOTE, 'feat', 'main');
  });
});

describe('POST /api/code/local-pull-requests', () => {
  const body = { remoteUrl: REMOTE, head: 'feat', base: 'main', title: 'Add feature' };

  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await POST(postRequest(body));

    expect(response.status).toBe(401);
    expect(mocks.openLocalPullRequest).not.toHaveBeenCalled();
  });

  it('returns the CSRF refusal bound to the caller', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(postRequest(body));

    expect(response.status).toBe(403);
    expect(mocks.requireCsrfToken).toHaveBeenCalledWith(expect.anything(), 'user-1');
    expect(mocks.openLocalPullRequest).not.toHaveBeenCalled();
  });

  it('rejects a body that is not an object', async () => {
    const notJson = await POST(postRequest('{'));
    expect(notJson.status).toBe(400);

    const array = await POST(postRequest([body]));
    expect(array.status).toBe(400);
    expect(mocks.openLocalPullRequest).not.toHaveBeenCalled();
  });

  it('maps a service validation error to 400 and audits nothing', async () => {
    mocks.openLocalPullRequest.mockRejectedValue(new LocalPullRequestError('No commits'));

    const response = await POST(postRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('opens the pull request as the caller and audits it', async () => {
    const response = await POST(postRequest(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(PULL_REQUEST);
    expect(mocks.withRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'chat-conversation',
      'user:user-1',
    );
    expect(mocks.openLocalPullRequest).toHaveBeenCalledWith('user-1', body);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'tool_executed',
        detail: expect.objectContaining({
          resourceId: PULL_REQUEST.url,
          status: 'pull_request_opened',
        }),
      }),
    );
  });
});
