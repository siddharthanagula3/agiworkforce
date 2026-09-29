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

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => mocks.serviceDb) }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock('@/lib/slack/slack-api', () => ({
  postSlackMessage: mocks.postSlackMessage,
  readSlackUser: mocks.readSlackUser,
}));
vi.mock('@/lib/slack/slack-config', () => ({
  isSlackAppConfigured: mocks.isSlackAppConfigured,
  slackAppOrigin: mocks.slackAppOrigin,
  slackSettingsUrl: (origin: string) => `${origin}/chat?settings=slack`,
}));
vi.mock('@/lib/slack/slack-installations', () => ({
  findSlackInstallationById: mocks.findSlackInstallationById,
}));
vi.mock('@/lib/slack/slack-links', () => ({
  SlackLinkConflictError: mocks.SlackLinkConflictError,
  consumeSlackLinkRequest: mocks.consumeSlackLinkRequest,
  isSlackLinkToken: (value: unknown) =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value),
  linkSlackAccount: mocks.linkSlackAccount,
  previewSlackLinkRequest: mocks.previewSlackLinkRequest,
}));
vi.mock('@/lib/slack/slack-messages', () => ({
  linkedMessage: vi.fn(() => ({ text: 'Linked', blocks: [] })),
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveOrganizationMembershipId: mocks.resolveOrganizationMembershipId,
}));
vi.mock('@/lib/slack/slack-settings', () => ({
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
