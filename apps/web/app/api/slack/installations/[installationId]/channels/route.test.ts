import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type SecurityAuditModule = typeof import('@/lib/security-audit');
type ChannelPoliciesModule = typeof import('@/lib/slack/slack-channel-policies');

const mocks = vi.hoisted(() => ({
  csrf: vi.fn(),
  rateLimit: vi.fn(),
  list: vi.fn(),
  set: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: mocks.csrf,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mocks.rateLimit,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: async () => ({
    db: { query: vi.fn() },
    userId: 'user-1',
    organizationId: 'org-1',
  }),
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: () => ({ query: vi.fn() }),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: mocks.audit,
}));
vi.mock('@/lib/slack/slack-channel-policies', async (importOriginal) => ({
  ...(await importOriginal<ChannelPoliciesModule>()),
  listSlackChannelPolicies: mocks.list,
  setSlackChannelPolicy: mocks.set,
}));

const { GET, PUT } = await import('./route');

const INSTALLATION = '7a1d6c3a-2b4f-4d7e-9a1c-0f2e3d4c5b6a';
const PATH = `/api/slack/installations/${INSTALLATION}/channels`;
const POLICIES = {
  teamId: 'T0123',
  channels: [
    {
      channelId: 'C0456',
      mode: 'answer',
      tools: ['web'],
      seen: true,
      updatedAt: '2026-10-19T00:00:00Z',
    },
  ],
};

function request(method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost${PATH}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

function context(installationId = INSTALLATION) {
  return { params: Promise.resolve({ installationId }) };
}

describe('/api/slack/installations/[installationId]/channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.csrf.mockResolvedValue(null);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.list.mockResolvedValue(POLICIES);
    mocks.set.mockResolvedValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
  });

  it('GET lists the channel policies of the installation for the caller, uncached', async () => {
    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'slack-settings',
      'user:user-1',
    );
    expect(mocks.list).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'user-1',
      INSTALLATION,
    );
    expect(await response.json()).toEqual(POLICIES);
  });

  it('GET refuses an installation id that is not an id', async () => {
    const response = await GET(request(), context('slack'));
    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('PUT sets one channel’s mode, audits the change and answers with the new list', async () => {
    const response = await PUT(request('PUT', { channelId: 'C0456', mode: 'off' }), context());

    expect(response.status).toBe(200);
    expect(mocks.csrf).toHaveBeenCalledWith(expect.anything(), 'user-1');
    expect(mocks.set).toHaveBeenCalledWith(expect.anything(), 'user-1', {
      installationId: INSTALLATION,
      channelId: 'C0456',
      mode: 'off',
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        eventType: 'connector_setting_changed',
        detail: expect.objectContaining({ resourceId: 'C0456', status: 'off' }),
      }),
    );
    expect(await response.json()).toEqual(POLICIES);
  });

  it('PUT records a cleared mode as the default', async () => {
    await PUT(request('PUT', { channelId: 'C0456', mode: null }), context());
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ status: 'default' }) }),
    );
  });

  it('PUT refuses a channel id Slack would never send', async () => {
    const response = await PUT(request('PUT', { channelId: 'general', mode: 'off' }), context());
    expect(response.status).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('PUT returns the CSRF refusal and changes nothing', async () => {
    mocks.csrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await PUT(request('PUT', { channelId: 'C0456', mode: 'off' }), context());
    expect(response.status).toBe(403);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('PUT saves the tools a channel allows and audits them', async () => {
    const response = await PUT(
      request('PUT', { channelId: 'C0456', mode: 'answer', tools: ['web'] }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith(expect.anything(), 'user-1', {
      installationId: INSTALLATION,
      channelId: 'C0456',
      mode: 'answer',
      tools: ['web'],
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ scopes: ['web'] }) }),
    );
  });

  it('PUT records every tool group when the channel goes back to all tools', async () => {
    await PUT(request('PUT', { channelId: 'C0456', mode: 'task', tools: null }), context());
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ scopes: ['web', 'code', 'apps'] }),
      }),
    );
  });

  it.each([[['shell']], [['web', 'web']]])('PUT refuses the tool list %j', async (tools) => {
    const response = await PUT(
      request('PUT', { channelId: 'C0456', mode: 'task', tools }),
      context(),
    );
    expect(response.status).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
