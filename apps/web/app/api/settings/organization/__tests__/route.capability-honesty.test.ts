import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockQuery, mockExecute } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(async () => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'owner-user' })),
}));

vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn(async () => ({
    plan: 'team',
    canManageTeam: true,
    maxMembers: null,
  })),
  getTeamAdminAccess: vi.fn(async () => ({
    plan: 'team',
    canManageTeam: true,
    maxMembers: null,
  })),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockQuery(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  })),
}));

import { PATCH } from '../route';

const membership = {
  organization_id: '11111111-1111-4111-8111-111111111111',
  user_id: 'owner-user',
  role: 'owner',
  provisioning_source: 'manual',
  provisioned_at: null,
  joined_at: '2026-07-23T00:00:00.000Z',
};

function request(body: unknown) {
  return new Request('http://localhost:3000/api/settings/organization', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('PATCH /api/settings/organization capability honesty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValueOnce([membership]);
  });

  it('rejects policy-like settings that the backend does not enforce', async () => {
    const response = await PATCH(
      request({
        settings: {
          enforceSSO: true,
          dataRetention: 30,
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
    const body = (await response.json()) as {
      error: { message: string; details?: { unsupportedFields?: string[] } };
    };
    expect(body.error.message).toContain('not available yet');
    expect(body.error.details?.unsupportedFields).toContain('settings');
  });

  it('rejects an empty update instead of reporting success', async () => {
    const response = await PATCH(request({}));

    expect(response.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
