import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  getClerkAuthUser: vi.fn(),
  scopedDb: { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  propose: vi.fn(),
  confirm: vi.fn(),
  listAvailable: vi.fn(),
}));

vi.hoisted(() => {
  process.env['NEXT_PUBLIC_APP_URL'] = 'https://agiworkforce.com';
  process.env['ALLOWED_ORIGINS'] = 'https://agiworkforce.com';
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mocks.getClerkAuthUser }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/support/actions/service', () => ({
  proposeSupportAction: mocks.propose,
  confirmSupportAction: mocks.confirm,
  listAvailableSupportActions: mocks.listAvailable,
}));

import { createError } from '@/lib/errors';
import { SupportActionRefusal } from '@/lib/support/actions/types';
import { POST as CONFIRM } from '../confirm/route';
import { POST as PROPOSE } from '../propose/route';
import { GET as AVAILABLE } from '../available/route';

function post(path: string, body: unknown): NextRequest {
  return new NextRequest(`https://agiworkforce.com${path}`, {
    method: 'POST',
    headers: { Origin: 'https://agiworkforce.com', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const PROPOSAL_ID = '77777777-7777-4777-8777-777777777777';
const TOKEN = 'a'.repeat(43);

describe('POST /api/support/actions/propose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({
      db: mocks.scopedDb,
      userId: 'session_user',
      organizationId: null,
    });
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'session_user' });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.propose.mockResolvedValue({
      proposal: {
        id: PROPOSAL_ID,
        actionId: 'export_account_data',
        title: 'Export your data',
        summary: 'We will start a download of your own account data.',
        effects: ['A file is generated.'],
        reversible: true,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      confirmationToken: TOKEN,
    });
  });

  it('ignores a user id in the body and proposes for the session caller', async () => {
    const response = await PROPOSE(
      post('/api/support/actions/propose', {
        actionId: 'export_account_data',
        userId: 'victim_user',
        user_id: 'victim_user',
        params: {},
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.propose).toHaveBeenCalledTimes(1);
    const call = mocks.propose.mock.calls[0]![0] as Record<string, unknown>;
    expect(call['userId']).toBe('session_user');
    expect(JSON.stringify(call['params'])).not.toContain('victim_user');
  });

  it('requires CSRF before proposing anything', async () => {
    mocks.requireCsrfToken.mockResolvedValue(
      new Response(JSON.stringify({ error: 'csrf' }), { status: 403 }),
    );
    const response = await PROPOSE(
      post('/api/support/actions/propose', { actionId: 'export_account_data' }),
    );
    expect(response.status).toBe(403);
    expect(mocks.propose).not.toHaveBeenCalled();
  });

  it('rate limits before proposing anything', async () => {
    mocks.withRateLimit.mockResolvedValue(
      new Response(JSON.stringify({ error: 'slow down' }), { status: 429 }),
    );
    const response = await PROPOSE(
      post('/api/support/actions/propose', { actionId: 'export_account_data' }),
    );
    expect(response.status).toBe(429);
    expect(mocks.propose).not.toHaveBeenCalled();
  });

  it('renders an excluded action as a structured refusal with a real control', async () => {
    mocks.propose.mockRejectedValue(
      new SupportActionRefusal('SUPPORT_ACTION_EXCLUDED', 400, 'Not something I will do.', {
        control: { label: 'Billing', href: '/settings/billing' },
      }),
    );

    const response = await PROPOSE(
      post('/api/support/actions/propose', { actionId: 'cancel_subscription' }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'SUPPORT_ACTION_EXCLUDED',
      control: { href: '/settings/billing' },
    });
  });
});

describe('POST /api/support/actions/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({
      db: mocks.scopedDb,
      userId: 'session_user',
      organizationId: null,
    });
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'session_user' });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.confirm.mockResolvedValue({
      actionId: 'open_billing_portal',
      result: { kind: 'handoff', message: 'ok', request: { method: 'POST', path: '/api/portal' } },
    });
  });

  it('drops an actionId and params smuggled alongside the token', async () => {
    const response = await CONFIRM(
      post('/api/support/actions/confirm', {
        proposalId: PROPOSAL_ID,
        confirmationToken: TOKEN,
        actionId: 'regenerate_api_key',
        params: { keyId: '88888888-8888-4888-8888-888888888888' },
      }),
    );

    expect(response.status).toBe(200);
    const call = mocks.confirm.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(call).sort()).toEqual(
      ['confirmationToken', 'db', 'proposalId', 'request', 'surface', 'userId'].sort(),
    );
    expect(call['userId']).toBe('session_user');
    expect(call).not.toHaveProperty('actionId');
    expect(call).not.toHaveProperty('params');
    await expect(response.json()).resolves.toMatchObject({ actionId: 'open_billing_portal' });
  });

  it('rejects a body missing the token before touching the service', async () => {
    const response = await CONFIRM(
      post('/api/support/actions/confirm', { proposalId: PROPOSAL_ID }),
    );
    expect(response.status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('returns 410 for a spent or expired confirmation, not a 500', async () => {
    mocks.confirm.mockRejectedValue(
      new SupportActionRefusal(
        'SUPPORT_ACTION_PROPOSAL_SPENT',
        410,
        'That confirmation is no longer valid.',
      ),
    );
    const response = await CONFIRM(
      post('/api/support/actions/confirm', {
        proposalId: PROPOSAL_ID,
        confirmationToken: TOKEN,
      }),
    );
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      code: 'SUPPORT_ACTION_PROPOSAL_SPENT',
    });
  });

  it('requires CSRF before executing anything', async () => {
    mocks.requireCsrfToken.mockResolvedValue(
      new Response(JSON.stringify({ error: 'csrf' }), { status: 403 }),
    );
    const response = await CONFIRM(
      post('/api/support/actions/confirm', {
        proposalId: PROPOSAL_ID,
        confirmationToken: TOKEN,
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});

describe('GET /api/support/actions/available', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({
      db: mocks.scopedDb,
      userId: 'session_user',
      organizationId: null,
    });
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'session_user' });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.listAvailable.mockReturnValue({ actions: [], unavailable: [], excluded: [] });
  });

  it('requires a session, an anonymous caller is never shown an action list', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    mocks.getClerkAuthUser.mockRejectedValue(createError.unauthorized());
    const response = await AVAILABLE(
      new NextRequest('https://agiworkforce.com/api/support/actions/available'),
    );
    expect(response.status).toBe(401);
    expect(mocks.listAvailable).not.toHaveBeenCalled();
  });

  it('returns the allowlist, the unavailable set and the exclusions for a session caller', async () => {
    mocks.listAvailable.mockReturnValue({
      actions: [{ id: 'export_account_data', title: 'Export your data', description: 'x' }],
      unavailable: [{ id: 'resend_verification_email', reason: 'no mail provider' }],
      excluded: [
        {
          id: 'delete_account',
          reason: 'permanent',
          control: { label: 'x', href: '/settings/account' },
        },
      ],
    });
    const response = await AVAILABLE(
      new NextRequest('https://agiworkforce.com/api/support/actions/available'),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      actions: [{ id: 'export_account_data' }],
      unavailable: [{ id: 'resend_verification_email' }],
      excluded: [{ id: 'delete_account' }],
    });
  });
});
