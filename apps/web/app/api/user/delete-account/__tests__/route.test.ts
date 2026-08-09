import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockExecute, mockEraseUserAccountData, mockDeleteUser } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockEraseUserAccountData: vi.fn(),
  mockDeleteUser: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(async () => null),
}));

vi.mock('@/lib/cors', () => ({
  handleCorsPreflightRequest: vi.fn(() => null),
  getCorsHeaders: vi.fn(() => ({})),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user_deleting' })),
}));

vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/server/pseudonymize', () => ({
  pseudonymizeIdentifier: vi.fn(() => 'subject-ref'),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    execute: (...args: unknown[]) => mockExecute(...args),
  })),
}));

vi.mock('@/lib/server/account-erasure', () => ({
  eraseUserAccountData: (...args: unknown[]) => mockEraseUserAccountData(...args),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({ users: { deleteUser: mockDeleteUser } })),
}));

import { DELETE } from '../route';

function deleteRequest() {
  return new Request('http://localhost:3000/api/user/delete-account', {
    method: 'DELETE',
  }) as never;
}

function pgError(code: string): Error {
  return Object.assign(new Error(`postgres error ${code}`), { code });
}

const completeErasure = {
  userId: 'user_deleting',
  mediaObjectsDeleted: 0,
  mediaObjectsFailed: 0,
  mediaRowsDeleted: 0,
  tables: {},
  complete: true,
};

describe('DELETE /api/user/delete-account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEraseUserAccountData.mockResolvedValue(completeErasure);
    mockDeleteUser.mockResolvedValue(undefined);
  });

  it('schedules deletion when the update touches the profile row', async () => {
    mockExecute.mockResolvedValue(1);

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scheduledFor).toBeTruthy();
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('erases immediately only when the deletion columns are missing (42703)', async () => {
    mockExecute.mockRejectedValue(pgError('42703'));

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scheduledFor).toBeUndefined();
    expect(mockEraseUserAccountData).toHaveBeenCalledWith('user_deleting');
    expect(mockDeleteUser).toHaveBeenCalledWith('user_deleting');
  });

  it('does not hard-delete on a transient database error', async () => {
    mockExecute.mockRejectedValue(
      Object.assign(new Error('terminating connection due to administrator command'), {
        code: '57P01',
      }),
    );

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(body.error).toMatch(/Nothing was deleted/i);
  });

  it('does not hard-delete on an error carrying no Postgres code', async () => {
    mockExecute.mockRejectedValue(new Error('fetch failed'));

    const response = await DELETE(deleteRequest());

    expect(response.status).toBe(500);
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('fails loudly when the update matches no profile row', async () => {
    mockExecute.mockResolvedValue(0);

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    // The purge cron reads its queue from `profiles`; a schedule stored nowhere
    // would never be acted on, so a 200 with `scheduledFor` would be a promise
    // no job can keep.
    expect(response.status).toBe(500);
    expect(body.scheduledFor).toBeUndefined();
    expect(mockEraseUserAccountData).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('does not claim data was untouched when an immediate erasure is partial', async () => {
    mockExecute.mockRejectedValue(pgError('42703'));
    mockEraseUserAccountData.mockResolvedValue({
      ...completeErasure,
      tables: { web_conversations: { deleted: true }, profiles: { deleted: false, error: 'boom' } },
      complete: false,
    });

    const response = await DELETE(deleteRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).not.toMatch(/no data was partially removed/i);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });
});
