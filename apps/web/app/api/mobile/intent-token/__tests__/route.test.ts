import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockIssue, mockRevoke, mockRevokeById } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockIssue: vi.fn(),
  mockRevoke: vi.fn(),
  mockRevokeById: vi.fn(),
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
vi.mock('@/app/api/settings/sessions/session-principal', () => ({
  resolveSessionsPrincipal: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mockQuery(...args) },
    userId: 'user-1',
    organizationId: null,
    currentSessionId: 'sess_phone',
  })),
}));
vi.mock('@/lib/server/mobile-intent-tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/mobile-intent-tokens')>()),
  issueMobileIntentToken: (...args: unknown[]) => mockIssue(...args),
  revokeMobileIntentTokens: (...args: unknown[]) => mockRevoke(...args),
  revokeMobileIntentTokenById: (...args: unknown[]) => mockRevokeById(...args),
}));

import { DELETE, POST } from '../route';

const INSTALL_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN_ID = '22222222-2222-4222-8222-222222222222';

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
    mockIssue.mockResolvedValueOnce({ token: `agi_it_${'a'.repeat(43)}`, tokenId: TOKEN_ID });
    const res = await POST(request('POST', { installId: INSTALL_ID }));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ tokenId: TOKEN_ID });
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('identity_session_id = $3'), [
      'user-1',
      INSTALL_ID,
      'sess_phone',
    ]);
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

  it('revokes only the named token when DELETE carries a token id', async () => {
    const res = await DELETE(
      new Request(`http://localhost:3000/api/mobile/intent-token?tokenId=${TOKEN_ID}`, {
        method: 'DELETE',
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(mockRevokeById).toHaveBeenCalledWith(expect.anything(), 'user-1', TOKEN_ID);
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('refuses a DELETE that names both an install and a token', async () => {
    const res = await DELETE(
      new Request(
        `http://localhost:3000/api/mobile/intent-token?installId=${INSTALL_ID}&tokenId=${TOKEN_ID}`,
        { method: 'DELETE' },
      ) as never,
    );
    expect(res.status).toBe(400);
    expect(mockRevokeById).not.toHaveBeenCalled();
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});
