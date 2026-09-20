import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  recordWorkspaceAuditEvent: vi.fn(),
  featureGate: vi.fn(),
  requireCsrfToken: vi.fn(async () => null),
  withRateLimit: vi.fn(async () => null),
  getUserScopedDb: vi.fn(),
}));

vi.mock('@/lib/managed-compute-gate', () => ({
  buildWorkspaceFeatureGateResponse: mocks.featureGate,
}));

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/workspace-audit', () => ({
  recordWorkspaceAuditEvent: mocks.recordWorkspaceAuditEvent,
}));

import { POST } from '../route';

const CODE = 'ABCD1234WXYZ';
const USER_ID = 'user-1';

function claimRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/pair/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function relayClaim() {
  return {
    code: CODE,
    role: 'mobile',
    pairToken: 'f'.repeat(64),
    expiresAt: 1_800_000_000_000,
    wsUrl: 'wss://signal.example.test/ws',
  };
}

function relayReturns(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async (_url: string | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('POST /api/pair/claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.featureGate.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({
      db: { query: vi.fn(), execute: vi.fn() },
      userId: USER_ID,
      organizationId: null,
    });
    vi.stubEnv('SIGNALING_HTTP_URL', 'https://signal.example.test');
    vi.stubEnv('SIGNALING_INTERNAL_SECRET', 'signal-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // The relay has no verifier for a user token, so this route is the only place
  // the claiming account is established. If it ever stopped sending it, the
  // relay would refuse rather than pair the wrong account.
  it('tells the relay which authenticated account is claiming, under the internal secret', async () => {
    const fetchMock = relayReturns(200, relayClaim());

    const response = await POST(claimRequest({ code: CODE }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(relayClaim());

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://signal.example.test/pairings/${CODE}/claim`);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer signal-secret');
    expect(JSON.parse(String(init.body))).toEqual({ role: 'mobile', accountId: USER_ID });
  });

  it('refuses an unauthenticated caller before it reaches the relay', async () => {
    const fetchMock = relayReturns(200, relayClaim());
    mocks.getUserScopedDb.mockRejectedValue(new Error('no session'));

    const response = await POST(claimRequest({ code: CODE }));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the relay refusal for another account through as a refusal, with an audit trail', async () => {
    relayReturns(403, { error: 'pairing_belongs_to_another_account' });

    const response = await POST(claimRequest({ code: CODE }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'pairing_belongs_to_another_account' });
    expect(mocks.recordWorkspaceAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        userId: USER_ID,
        outcome: 'failure',
        detail: expect.objectContaining({ status: 'claim_rejected', resourceId: CODE }),
      }),
    );
  });

  it('keeps the relay answer for a missing or already paired session', async () => {
    relayReturns(404, { error: 'pairing_not_found' });
    expect((await POST(claimRequest({ code: CODE }))).status).toBe(404);

    relayReturns(409, { error: 'pairing_role_in_use' });
    expect((await POST(claimRequest({ code: CODE }))).status).toBe(409);
  });

  it('records the claim without putting the pair token in the trail', async () => {
    relayReturns(200, relayClaim());

    await POST(claimRequest({ code: CODE }));

    const event = mocks.recordWorkspaceAuditEvent.mock.calls[0]?.[2];
    expect(event).toMatchObject({
      userId: USER_ID,
      eventType: 'remote_pairing_claimed',
      detail: { resourceType: 'remote_pairing', resourceId: CODE, source: 'mobile' },
    });
    expect(JSON.stringify(event)).not.toContain('f'.repeat(64));
  });

  it('refuses a code the relay could not have issued before calling it', async () => {
    const fetchMock = relayReturns(200, relayClaim());

    for (const code of ['ABCD1234', 'ABCD1234WXYZ9', '', 'not a code']) {
      const response = await POST(claimRequest({ code }));
      expect(response.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts the code as the user typed it, spaced and in lower case', async () => {
    const fetchMock = relayReturns(200, relayClaim());

    const response = await POST(claimRequest({ code: 'abcd 1234 wxyz' }));

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://signal.example.test/pairings/${CODE}/claim`);
  });

  it('does not call the relay when pairing is unconfigured', async () => {
    const fetchMock = relayReturns(200, relayClaim());
    vi.stubEnv('SIGNALING_INTERNAL_SECRET', '');

    const response = await POST(claimRequest({ code: CODE }));

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a relay payload it does not recognise rather than passing it on', async () => {
    relayReturns(200, { code: CODE, role: 'mobile' });

    const response = await POST(claimRequest({ code: CODE }));

    expect(response.status).toBe(502);
  });
});
