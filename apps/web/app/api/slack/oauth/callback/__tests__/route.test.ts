import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  class SlackLinkConflictError extends Error {}
  return {
    SlackLinkConflictError,
    getUserScopedDb: vi.fn(),
    isAuthGateRefusal: vi.fn(),
    unauthorizedResponseFor: vi.fn(),
    withRateLimit: vi.fn(),
    recordAuditEvent: vi.fn(),
    cookieGet: vi.fn(),
    cookieSet: vi.fn(),
    exchangeSlackOAuthCode: vi.fn(),
    postSlackMessage: vi.fn(),
    readSlackUser: vi.fn(),
    revokeSlackToken: vi.fn(),
    slackAppOrigin: vi.fn(),
    slackAppCredentials: vi.fn(),
    saveSlackInstallation: vi.fn(),
    linkSlackAccount: vi.fn(),
    slackPlanAllowed: vi.fn(),
    serviceDb: { query: vi.fn() },
  };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet, set: mocks.cookieSet })),
}));
vi.mock('@/lib/api-auth-response', () => ({
  isAuthGateRefusal: mocks.isAuthGateRefusal,
  unauthorizedResponseFor: mocks.unauthorizedResponseFor,
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
  isSlackTokenRevoked: vi.fn(),
  postSlackEphemeral: vi.fn(),
  readSlackHistory: vi.fn(),
  readSlackThread: vi.fn(),
  setSlackReaction: vi.fn(),
  exchangeSlackOAuthCode: mocks.exchangeSlackOAuthCode,
  postSlackMessage: mocks.postSlackMessage,
  readSlackUser: mocks.readSlackUser,
  revokeSlackToken: mocks.revokeSlackToken,
}));
vi.mock('@/lib/slack/slack-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/slack/slack-config')>()),
  slackAppOrigin: mocks.slackAppOrigin,
  slackAppCredentials: mocks.slackAppCredentials,
}));
vi.mock('@/lib/slack/slack-installations', () => ({
  deleteSlackInstallationForTeam: vi.fn(),
  findSlackInstallation: vi.fn(),
  findSlackInstallationById: vi.fn(),
  listSlackWorkspacesInstalledBy: vi.fn(),
  uninstallSlackWorkspace: vi.fn(),
  saveSlackInstallation: mocks.saveSlackInstallation,
}));
vi.mock('@/lib/slack/slack-links', () => ({
  consumeSlackLinkRequest: vi.fn(),
  isSlackLinkToken: vi.fn(),
  issueSlackLinkRequest: vi.fn(),
  listSlackAccountLinks: vi.fn(),
  previewSlackLinkRequest: vi.fn(),
  resolveSlackAccountLink: vi.fn(),
  unlinkSlackAccount: vi.fn(),
  SlackLinkConflictError: mocks.SlackLinkConflictError,
  linkSlackAccount: mocks.linkSlackAccount,
}));
vi.mock('@/lib/slack/slack-messages', () => ({
  answerMessages: vi.fn(),
  approvalMessage: vi.fn(),
  escapeMrkdwn: vi.fn(),
  linkPromptMessage: vi.fn(),
  noticeMessage: vi.fn(),
  linkedMessage: vi.fn(() => ({ text: 'Linked', blocks: [] })),
}));
vi.mock('@/lib/slack/slack-settings', () => ({
  PERSONAL_WORKSPACE_NAME: 'Personal',
  listSlackLinkWorkspaces: vi.fn(),
  loadSlackOverview: vi.fn(),
  slackRequiredPlans: vi.fn(),
  slackPlanAllowed: mocks.slackPlanAllowed,
}));

import { GET } from '../route';

const ORIGIN = 'https://app.example.com';
const ORG = '11111111-1111-4111-8111-111111111111';
const STATE = 'a'.repeat(64);
const scopedDb = { query: vi.fn() };
const credentials = { clientId: 'client-1', clientSecret: 'secret' };
const access = {
  enterpriseInstall: false,
  teamId: 'T1',
  teamName: 'Acme',
  enterpriseId: null,
  appId: 'A1',
  botUserId: 'B1',
  scopes: ['chat:write'],
  botToken: 'xoxb-test',
  authedUserId: 'U1',
};

function request(params: Record<string, string> = { state: STATE, code: 'code-1' }): NextRequest {
  const url = new URL('https://app.example.com/api/slack/oauth/callback');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

function statusOf(response: Response): string | null {
  return new URL(response.headers.get('location') ?? '').searchParams.get('slack');
}

describe('GET /api/slack/oauth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({
      db: scopedDb,
      userId: 'user-1',
      organizationId: ORG,
    });
    mocks.isAuthGateRefusal.mockReturnValue(false);
    mocks.slackAppOrigin.mockReturnValue(ORIGIN);
    mocks.slackAppCredentials.mockReturnValue(credentials);
    mocks.cookieGet.mockReturnValue({ value: `${STATE}.user-1` });
    mocks.exchangeSlackOAuthCode.mockResolvedValue(access);
    mocks.revokeSlackToken.mockResolvedValue(undefined);
    mocks.saveSlackInstallation.mockResolvedValue({
      id: 'inst-1',
      teamId: 'T1',
      teamName: 'Acme',
    });
    mocks.slackPlanAllowed.mockResolvedValue(true);
    mocks.readSlackUser.mockResolvedValue({ displayName: 'Ada' });
    mocks.linkSlackAccount.mockResolvedValue('link-1');
    mocks.postSlackMessage.mockResolvedValue(undefined);
  });

  it('redirects a signed out browser to login', async () => {
    mocks.getUserScopedDb.mockRejectedValue(new Error('no session'));
    const response = await GET(request());
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/login');
    expect(mocks.exchangeSlackOAuthCode).not.toHaveBeenCalled();
  });

  it('answers an auth gate refusal with the gate response', async () => {
    mocks.getUserScopedDb.mockRejectedValue(new Error('mfa'));
    mocks.isAuthGateRefusal.mockReturnValue(true);
    mocks.unauthorizedResponseFor.mockReturnValue(
      NextResponse.json({ error: 'mfa' }, { status: 403 }),
    );
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(mocks.exchangeSlackOAuthCode).not.toHaveBeenCalled();
  });

  it('reports a denied install when Slack returns an error', async () => {
    const response = await GET(request({ error: 'access_denied' }));
    expect(statusOf(response)).toBe('denied');
    expect(mocks.exchangeSlackOAuthCode).not.toHaveBeenCalled();
  });

  it('refuses a state that does not match the cookie', async () => {
    const response = await GET(request({ state: 'b'.repeat(64), code: 'code-1' }));
    expect(statusOf(response)).toBe('invalid_state');
    expect(mocks.exchangeSlackOAuthCode).not.toHaveBeenCalled();
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'slack_install_state', value: '', maxAge: 0 }),
    );
  });

  it('refuses a state bound to a different user', async () => {
    mocks.cookieGet.mockReturnValue({ value: `${STATE}.user-2` });
    const response = await GET(request());
    expect(statusOf(response)).toBe('invalid_state');
    expect(mocks.exchangeSlackOAuthCode).not.toHaveBeenCalled();
  });

  it('reports a failed exchange', async () => {
    mocks.exchangeSlackOAuthCode.mockRejectedValue(new Error('bad code'));
    const response = await GET(request());
    expect(statusOf(response)).toBe('failed');
    expect(mocks.saveSlackInstallation).not.toHaveBeenCalled();
  });

  it('revokes and refuses an organization wide install', async () => {
    mocks.exchangeSlackOAuthCode.mockResolvedValue({ ...access, enterpriseInstall: true });
    const response = await GET(request());
    expect(statusOf(response)).toBe('workspace_install_only');
    expect(mocks.revokeSlackToken).toHaveBeenCalledWith('xoxb-test');
    expect(mocks.saveSlackInstallation).not.toHaveBeenCalled();
  });

  it('saves the install for the caller, links the installer and reports installed', async () => {
    const response = await GET(request());
    expect(response.status).toBe(307);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(statusOf(response)).toBe('installed');
    expect(mocks.exchangeSlackOAuthCode).toHaveBeenCalledWith({
      credentials,
      code: 'code-1',
      redirectUri: `${ORIGIN}/api/slack/oauth/callback`,
    });
    expect(mocks.saveSlackInstallation).toHaveBeenCalledWith(
      mocks.serviceDb,
      expect.objectContaining({ teamId: 'T1', installedByUserId: 'user-1' }),
    );
    expect(mocks.linkSlackAccount).toHaveBeenCalledWith(scopedDb, {
      userId: 'user-1',
      organizationId: ORG,
      installationId: 'inst-1',
      slackUserId: 'U1',
      slackUserName: 'Ada',
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', eventType: 'connector_added' }),
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', eventType: 'identity_linked' }),
    );
  });

  it('installs without linking when the plan does not include Slack', async () => {
    mocks.slackPlanAllowed.mockResolvedValue(false);
    const response = await GET(request());
    expect(statusOf(response)).toBe('installed');
    expect(mocks.saveSlackInstallation).toHaveBeenCalled();
    expect(mocks.linkSlackAccount).not.toHaveBeenCalled();
  });
});
