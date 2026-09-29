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
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock('@/lib/github-app', () => ({
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
