import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  class SlackLinkConflictError extends Error {}
  return {
    SlackLinkConflictError,
    getUserScopedDb: vi.fn(),
    requireCsrfToken: vi.fn(),
    withRateLimit: vi.fn(),
    recordAuditEvent: vi.fn(),
    postSlackMessage: vi.fn(),
    readSlackUser: vi.fn(),
    isSlackAppConfigured: vi.fn(),
    slackAppOrigin: vi.fn(),
    findSlackInstallationById: vi.fn(),
    consumeSlackLinkRequest: vi.fn(),
    linkSlackAccount: vi.fn(),
    previewSlackLinkRequest: vi.fn(),
    resolveOrganizationMembershipId: vi.fn(),
    listSlackLinkWorkspaces: vi.fn(),
    slackPlanAllowed: vi.fn(),
    serviceDb: { query: vi.fn() },
  };
});

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
vi.mock('@/lib/server/neon-db', () => ({
  getStripeWebhookDb: vi.fn(),
  getNeonDb: vi.fn(() => mocks.serviceDb),
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
vi.mock('@/lib/slack/slack-api', () => ({
  SlackApiError: class SlackApiError extends Error {},
  exchangeSlackOAuthCode: vi.fn(),
  isSlackTokenRevoked: vi.fn(),
  postSlackEphemeral: vi.fn(),
  readSlackHistory: vi.fn(),
  readSlackThread: vi.fn(),
  revokeSlackToken: vi.fn(),
  setSlackReaction: vi.fn(),
  postSlackMessage: mocks.postSlackMessage,
  readSlackUser: mocks.readSlackUser,
}));
vi.mock('@/lib/slack/slack-config', () => ({
  SLACK_APPROVAL_TTL_HOURS: 24,
  SLACK_AUTHORIZE_URL: 'https://slack.com/oauth/v2/authorize',
  SLACK_BOT_SCOPES: vi.fn(),
  SLACK_CONTEXT_LIMITS: vi.fn(),
  SLACK_INSTALL_STATE_COOKIE: 'slack_install_state',
  SLACK_INSTALL_STATE_TTL_SECONDS: vi.fn(),
  SLACK_LINK_PATH: '/slack/link',
  SLACK_LINK_TTL_SECONDS: vi.fn(),
  SLACK_OAUTH_CALLBACK_PATH: '/api/slack/oauth/callback',
  SLACK_WORKING_REACTION: 'eyes',
  slackAppCredentials: vi.fn(),
  slackLinkUrl: vi.fn(),
  slackOAuthRedirectUri: vi.fn(),
  isSlackAppConfigured: mocks.isSlackAppConfigured,
  slackAppOrigin: mocks.slackAppOrigin,
  slackSettingsUrl: (origin: string) => `${origin}/chat?settings=slack`,
}));
vi.mock('@/lib/slack/slack-installations', () => ({
  deleteSlackInstallationForTeam: vi.fn(),
  findSlackInstallation: vi.fn(),
  listSlackWorkspacesInstalledBy: vi.fn(),
  saveSlackInstallation: vi.fn(),
  uninstallSlackWorkspace: vi.fn(),
  findSlackInstallationById: mocks.findSlackInstallationById,
}));
vi.mock('@/lib/slack/slack-links', () => ({
  issueSlackLinkRequest: vi.fn(),
  listSlackAccountLinks: vi.fn(),
  resolveSlackAccountLink: vi.fn(),
  unlinkSlackAccount: vi.fn(),
  SlackLinkConflictError: mocks.SlackLinkConflictError,
  consumeSlackLinkRequest: mocks.consumeSlackLinkRequest,
  isSlackLinkToken: (value: unknown) =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value),
  linkSlackAccount: mocks.linkSlackAccount,
  previewSlackLinkRequest: mocks.previewSlackLinkRequest,
}));
vi.mock('@/lib/slack/slack-messages', () => ({
  answerMessages: vi.fn(),
  approvalMessage: vi.fn(),
  escapeMrkdwn: vi.fn(),
  linkPromptMessage: vi.fn(),
  noticeMessage: vi.fn(),
  linkedMessage: vi.fn(() => ({ text: 'Linked', blocks: [] })),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  PERSONAL_WORKSPACE_KEY: vi.fn(),
  WORKSPACE_SETTINGS_NAMESPACE: 'workspace',
  listWorkspaceMemberships: vi.fn(),
  persistActiveWorkspaceSelection: vi.fn(),
  persistProvenActiveWorkspaceSelection: vi.fn(),
  readRecordedActiveWorkspaceId: vi.fn(),
  resolveActiveOrganizationId: vi.fn(),
  touchesActiveOrganizationNamespace: vi.fn(),
  resolveOrganizationMembershipId: mocks.resolveOrganizationMembershipId,
}));
vi.mock('@/lib/slack/slack-settings', () => ({
  PERSONAL_WORKSPACE_NAME: 'Personal',
  loadSlackOverview: vi.fn(),
  listSlackLinkWorkspaces: mocks.listSlackLinkWorkspaces,
  slackPlanAllowed: mocks.slackPlanAllowed,
  slackRequiredPlans: vi.fn(() => 'Pro, Max'),
}));

import { createError } from '@/lib/errors';

import { GET, POST } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '44444444-4444-4444-8444-444444444444';
const TOKEN = 'a'.repeat(43);
const orgDb = { query: vi.fn() };
const requestDb = { query: vi.fn(), withOrg: vi.fn(() => orgDb) };
const installation = {
  id: 'inst-1',
  teamId: 'T1',
  teamName: 'Acme',
  botToken: 'xoxb-test',
};

function previewRequest(token: string | null = TOKEN): NextRequest {
  const url = new URL('http://localhost/api/slack/link');
  if (token !== null) url.searchParams.set('token', token);
  return new NextRequest(url);
}

function confirmRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/slack/link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/slack/link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({
      db: requestDb,
      userId: 'user-1',
      organizationId: ORG,
    });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.isSlackAppConfigured.mockReturnValue(true);
    mocks.slackAppOrigin.mockReturnValue('https://app.example.com');
    mocks.previewSlackLinkRequest.mockResolvedValue({
      teamName: 'Acme',
      expiresAt: '2026-09-28T01:00:00.000Z',
    });
    mocks.listSlackLinkWorkspaces.mockResolvedValue([
      { id: null, name: 'Personal', planAllowed: true },
      { id: ORG, name: 'Team', planAllowed: true },
    ]);
    mocks.resolveOrganizationMembershipId.mockResolvedValue('membership-1');
    mocks.slackPlanAllowed.mockResolvedValue(true);
    mocks.consumeSlackLinkRequest.mockResolvedValue({
      installationId: 'inst-1',
      slackUserId: 'U1',
    });
    mocks.findSlackInstallationById.mockResolvedValue(installation);
    mocks.readSlackUser.mockResolvedValue({ displayName: 'Ada' });
    mocks.linkSlackAccount.mockResolvedValue('link-1');
    mocks.postSlackMessage.mockResolvedValue(undefined);
  });

  describe('GET', () => {
    it('returns 401 without a session', async () => {
      mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
      const response = await GET(previewRequest());
      expect(response.status).toBe(401);
      expect(mocks.previewSlackLinkRequest).not.toHaveBeenCalled();
    });

    it('returns 503 when Slack is not configured', async () => {
      mocks.isSlackAppConfigured.mockReturnValue(false);
      const response = await GET(previewRequest());
      expect(response.status).toBe(503);
    });

    it('rejects a malformed token', async () => {
      const response = await GET(previewRequest('short'));
      expect(response.status).toBe(400);
      expect(mocks.previewSlackLinkRequest).not.toHaveBeenCalled();
    });

    it('returns 404 for an expired or used link', async () => {
      mocks.previewSlackLinkRequest.mockResolvedValue(null);
      const response = await GET(previewRequest());
      expect(response.status).toBe(404);
    });

    it('previews the link with the caller workspaces and preselects the active one', async () => {
      const response = await GET(previewRequest());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        teamName: 'Acme',
        expiresAt: '2026-09-28T01:00:00.000Z',
        workspaces: [
          { id: null, name: 'Personal', planAllowed: true },
          { id: ORG, name: 'Team', planAllowed: true },
        ],
        selectedWorkspaceId: ORG,
        requiredPlans: 'Pro, Max',
      });
      expect(mocks.previewSlackLinkRequest).toHaveBeenCalledWith(mocks.serviceDb, TOKEN);
      expect(mocks.listSlackLinkWorkspaces).toHaveBeenCalledWith(requestDb, 'user-1');
    });
  });

  describe('POST', () => {
    it('returns 401 without a session', async () => {
      mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
      const response = await POST(confirmRequest({ token: TOKEN, organizationId: ORG }));
      expect(response.status).toBe(401);
      expect(mocks.consumeSlackLinkRequest).not.toHaveBeenCalled();
    });

    it('returns the CSRF refusal and consumes nothing', async () => {
      mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));
      const response = await POST(confirmRequest({ token: TOKEN, organizationId: ORG }));
      expect(response.status).toBe(403);
      expect(mocks.requireCsrfToken).toHaveBeenCalledWith(expect.anything(), 'user-1');
      expect(mocks.consumeSlackLinkRequest).not.toHaveBeenCalled();
    });

    it('rejects an invalid body', async () => {
      const response = await POST(confirmRequest({ token: TOKEN, organizationId: ORG, x: 1 }));
      expect(response.status).toBe(400);
      expect(mocks.consumeSlackLinkRequest).not.toHaveBeenCalled();
    });

    it('refuses a workspace the caller is not a member of', async () => {
      mocks.resolveOrganizationMembershipId.mockResolvedValue(null);
      const response = await POST(confirmRequest({ token: TOKEN, organizationId: OTHER_ORG }));
      expect(response.status).toBe(403);
      expect(mocks.resolveOrganizationMembershipId).toHaveBeenCalledWith(
        requestDb,
        'user-1',
        OTHER_ORG,
      );
      expect(mocks.consumeSlackLinkRequest).not.toHaveBeenCalled();
    });

    it('refuses a workspace whose plan does not include Slack', async () => {
      mocks.slackPlanAllowed.mockResolvedValue(false);
      const response = await POST(confirmRequest({ token: TOKEN, organizationId: ORG }));
      expect(response.status).toBe(403);
      expect(mocks.consumeSlackLinkRequest).not.toHaveBeenCalled();
    });

    it('returns 404 when the link was already used', async () => {
      mocks.consumeSlackLinkRequest.mockResolvedValue(null);
      const response = await POST(confirmRequest({ token: TOKEN, organizationId: ORG }));
      expect(response.status).toBe(404);
      expect(mocks.linkSlackAccount).not.toHaveBeenCalled();
    });

    it('returns 409 when the Slack account is linked elsewhere', async () => {
      mocks.linkSlackAccount.mockRejectedValue(new mocks.SlackLinkConflictError('taken'));
      const response = await POST(confirmRequest({ token: TOKEN, organizationId: ORG }));
      expect(response.status).toBe(409);
      expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    });

    it('links the Slack account to the caller in the chosen workspace', async () => {
      const response = await POST(confirmRequest({ token: TOKEN, organizationId: ORG }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ linked: true, teamName: 'Acme' });
      expect(requestDb.withOrg).toHaveBeenCalledWith(ORG);
      expect(mocks.consumeSlackLinkRequest).toHaveBeenCalledWith(mocks.serviceDb, TOKEN);
      expect(mocks.linkSlackAccount).toHaveBeenCalledWith(orgDb, {
        userId: 'user-1',
        organizationId: ORG,
        installationId: 'inst-1',
        slackUserId: 'U1',
        slackUserName: 'Ada',
      });
      expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          eventType: 'identity_linked',
          organizationId: ORG,
          detail: expect.objectContaining({ resourceId: 'link-1', subjectRef: 'T1:U1' }),
        }),
      );
      expect(mocks.postSlackMessage).toHaveBeenCalledWith(
        'xoxb-test',
        expect.objectContaining({ channel: 'U1' }),
      );
    });

    it('links a personal account without a membership check', async () => {
      const response = await POST(confirmRequest({ token: TOKEN, organizationId: null }));
      expect(response.status).toBe(200);
      expect(mocks.resolveOrganizationMembershipId).not.toHaveBeenCalled();
      expect(mocks.slackPlanAllowed).toHaveBeenCalledWith(orgDb, 'user-1', null);
    });
  });
});
