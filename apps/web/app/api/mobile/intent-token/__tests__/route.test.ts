import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockIssue, mockRevoke } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockIssue: vi.fn(),
  mockRevoke: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/server/mobile-intent-tokens', () => ({
  issueMobileIntentToken: (...args: unknown[]) => mockIssue(...args),
  revokeMobileIntentTokens: (...args: unknown[]) => mockRevoke(...args),
}));

import { DELETE, POST } from '../route';

const INSTALL_ID = '11111111-1111-4111-8111-111111111111';

function request(method: 'POST' | 'DELETE', body: unknown) {
  return new Request('http://localhost:3000/api/mobile/intent-token', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('/api/mobile/intent-token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues a token only for a phone registered to the caller', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'device-row' }]);
    mockIssue.mockResolvedValueOnce(`agi_it_${'a'.repeat(43)}`);
    const res = await POST(request('POST', { installId: INSTALL_ID }));
    expect(res.status).toBe(201);
    expect(mockIssue).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      organizationId: null,
      installId: INSTALL_ID,
      defaultModelId: null,
    });
  });

  it('refuses an install the caller has not registered', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const res = await POST(request('POST', { installId: INSTALL_ID }));
    expect(res.status).toBe(403);
    expect(mockIssue).not.toHaveBeenCalled();
  });

  it('revokes the install token on DELETE', async () => {
    const res = await DELETE(
      new Request(`http://localhost:3000/api/mobile/intent-token?installId=${INSTALL_ID}`, {
        method: 'DELETE',
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(mockRevoke).toHaveBeenCalledWith(expect.anything(), 'user-1', INSTALL_ID);
  });
});
