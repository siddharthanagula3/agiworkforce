import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));

const mockGetClerkAuthUser = vi.hoisted(() => vi.fn(async () => ({ userId: 'user_123' })));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mockGetClerkAuthUser }));

const tx = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
const db = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => db }));

import { GET, PUT } from '../route';

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/me/routing-preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('routing-preferences route uses the claimed user scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user_123' });
    tx.execute.mockResolvedValue(1);
  });

  it('GET binds the caller before reading routing_preferences', async () => {
    tx.query.mockImplementation(async (sql: string) => {
      if (sql.includes('select routing_preferences from profiles')) {
        return [{ routing_preferences: { us_only: true } }];
      }
      return [];
    });

    const response = await GET(
      new NextRequest('https://agiworkforce.com/api/me/routing-preferences'),
    );

    expect(response.status).toBe(200);
    expect(tx.execute).toHaveBeenCalledWith('set local role app_rls');
    expect(tx.query).toHaveBeenCalledWith(
      expect.stringContaining("set_config('request.jwt.claim.sub', $1, true)"),
      ['user_123', ''],
    );
  });

  it('PUT binds the caller before writing routing_preferences', async () => {
    tx.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('update profiles set routing_preferences')) return 1;
      return 0;
    });

    const response = await PUT(jsonRequest({ us_only: true }));

    expect(response.status).toBe(200);
    expect(tx.execute).toHaveBeenCalledWith('set local role app_rls');
    expect(tx.query).toHaveBeenCalledWith(
      expect.stringContaining("set_config('request.jwt.claim.sub', $1, true)"),
      ['user_123', ''],
    );
    expect(tx.execute).toHaveBeenCalledWith(
      'update profiles set routing_preferences = $1::jsonb, updated_at = now() where id = $2',
      [JSON.stringify({ us_only: true }), 'user_123'],
    );
  });
});
