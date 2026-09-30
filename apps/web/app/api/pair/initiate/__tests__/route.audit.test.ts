import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  recordWorkspaceAuditEvent: vi.fn(),
  featureGate: vi.fn(),
  execute: vi.fn(),
  requestingDevice: vi.fn(async () => null as string | null),
}));

vi.mock('@/lib/device-steps/requesting-device', () => ({
  readRequestingDevice: vi.fn(),
  readRequestingDeviceId: mocks.requestingDevice,
}));

vi.mock('@/lib/managed-compute-gate', () => ({
  buildWorkspaceFeatureGateResponse: mocks.featureGate,
}));

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/api-auth', () => ({
  isAccountUnavailableError: vi.fn(() => false),
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: vi.fn(), execute: mocks.execute },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/workspace-audit', () => ({
  recordWorkspaceAuditEvent: mocks.recordWorkspaceAuditEvent,
}));

vi.mock('@/lib/feature-flags/flag-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/feature-flags/flag-store')>()),
  getActiveFlagDefinitions: async () => [],
  getSubjectOverrides: async () => [],
}));

import { POST } from '../route';

const DESKTOP_ID = '44444444-4444-4444-8444-444444444444';

function pairRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/pair/initiate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function signalingPayload() {
  return {
    code: 'ABC123',
    expiresAt: 1_800_000_000_000,
    expiresIn: 300,
    httpUrl: 'https://signal.example.test',
    wsUrl: 'wss://signal.example.test',
    qrData: 'unused',
    pairTokens: { desktop: 'desktop-token', mobile: 'mobile-token' },
  };
}

describe('POST /api/pair/initiate audit trail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.featureGate.mockResolvedValue(null);
    vi.stubEnv('SIGNALING_HTTP_URL', 'https://signal.example.test');
    vi.stubEnv('SIGNALING_INTERNAL_SECRET', 'signal-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('records the pairing with the device and initiator, never the pairing code or tokens', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(signalingPayload()), { status: 200 })),
    );

    const response = await POST(pairRequest({ desktopId: DESKTOP_ID, initiator: 'desktop' }));

    expect(response.status).toBe(200);
    expect(mocks.recordWorkspaceAuditEvent).toHaveBeenCalledTimes(1);
    const [, , event] = mocks.recordWorkspaceAuditEvent.mock.calls[0]!;
    expect(event).toEqual({
      userId: 'user-1',
      eventType: 'remote_pairing_initiated',
      detail: { resourceType: 'remote_pairing', resourceId: DESKTOP_ID, source: 'desktop' },
    });
    expect(JSON.stringify(event)).not.toContain('ABC123');
    expect(JSON.stringify(event)).not.toContain('token');
  });

  it('records nothing when the signaling server refuses the pairing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );

    const response = await POST(pairRequest({}));

    expect(response.status).toBe(502);
    expect(mocks.recordWorkspaceAuditEvent).not.toHaveBeenCalled();
  });

  it.each(['desktop', 'mobile'] as const)(
    'returns only the %s initiator token, without a peer credential in the QR',
    async (initiator) => {
      const fetchMock = vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response(JSON.stringify(signalingPayload()), { status: 200 }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const response = await POST(pairRequest({ initiator }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Object.keys(body.pairTokens)).toEqual([initiator]);
      expect(body.qrData).toBe('agiw:ABC123');
      expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string).initiator).toBe(initiator);
    },
  );

  it('accepts the relay response with only the initiator credential', async () => {
    const payload = { ...signalingPayload(), pairTokens: { desktop: 'desktop-token' } };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );
    const response = await POST(pairRequest({ initiator: 'desktop' }));
    expect(response.status).toBe(200);
    expect((await response.json()).pairTokens).toEqual({ desktop: 'desktop-token' });
  });

  it('rejects a relay response that has only the other role credential', async () => {
    const payload = { ...signalingPayload(), pairTokens: { mobile: 'mobile-token' } };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );
    const response = await POST(pairRequest({ initiator: 'desktop' }));
    expect(response.status).toBe(502);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.recordWorkspaceAuditEvent).not.toHaveBeenCalled();
  });

  it('never reaches the signaling server when the workspace has turned Remote Control off', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mocks.featureGate.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'feature_disabled' } }), { status: 403 }),
    );

    const response = await POST(pairRequest({}));

    expect(response.status).toBe(403);
    expect(mocks.featureGate).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
      'remote_control',
      expect.any(String),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.recordWorkspaceAuditEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['desktop', 1],
    ['mobile', 0],
  ] as const)(
    'turns remote work back on for the device only when the %s starts the pairing',
    async (initiator, updates) => {
      mocks.requestingDevice.mockResolvedValueOnce('device-1');
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify(signalingPayload()), { status: 200 })),
      );

      const response = await POST(pairRequest({ desktopId: DESKTOP_ID, initiator }));

      expect(response.status).toBe(200);
      const enables = mocks.execute.mock.calls.filter(([sql]) =>
        String(sql).includes('set remote_enabled = true'),
      );
      expect(enables).toHaveLength(updates);
      if (updates) expect(enables[0]![1]).toEqual(['device-1', 'user-1']);
    },
  );
});
