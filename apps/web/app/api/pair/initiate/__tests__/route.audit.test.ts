import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  recordWorkspaceAuditEvent: vi.fn(),
}));

vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({ query: vi.fn() })) }));
vi.mock('@/lib/workspace-audit', () => ({
  recordWorkspaceAuditEvent: mocks.recordWorkspaceAuditEvent,
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
});
