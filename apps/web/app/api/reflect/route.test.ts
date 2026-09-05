import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ManagedCloudReflectRecapSchema } from '@agiworkforce/cloud-contracts';
import { createError } from '@/lib/errors';

const { mockGetUserScopedDb, mockLoadRecap, scopedDb } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockLoadRecap: vi.fn(),
  scopedDb: { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
}));

vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/services/reflect-service', () => ({ loadManagedReflectRecap: mockLoadRecap }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { GET } from './route';

function request(query = '') {
  return new NextRequest(`http://localhost:3000/api/reflect${query}`);
}

const recap = ManagedCloudReflectRecapSchema.parse({
  range: '30d',
  generatedAt: '2026-07-18T18:00:00.000Z',
  period: {
    start: '2026-06-18T18:00:00.000Z',
    end: '2026-07-18T18:00:00.000Z',
    label: 'Past 30 days',
  },
  summary: {
    headline: 'Writing led your past 30 days',
    body: 'You started 3 conversations across 2 active days.',
  },
  stats: { totalConversations: 3, activeDays: 2, mostActiveDay: '2026-07-10', peakHour: 15 },
  dailyActivity: [],
  topics: [],
  insights: [],
  sampled: false,
  sampledConversationCount: 3,
});

describe('GET /api/reflect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserScopedDb.mockResolvedValue({
      db: scopedDb,
      userId: 'owner-1',
      organizationId: '11111111-1111-4111-8111-111111111111',
    });
    mockLoadRecap.mockResolvedValue({ kind: 'recap', recap });
  });

  it('loads only the authenticated owner recap for a validated range and timezone', async () => {
    const response = await GET(request('?range=30d&timezone=America%2FChicago'));
    expect(response.status).toBe(200);
    expect(mockLoadRecap).toHaveBeenCalledWith({
      db: scopedDb,
      userId: 'owner-1',
      organizationId: '11111111-1111-4111-8111-111111111111',
      range: '30d',
      timezone: 'America/Chicago',
    });
    expect(ManagedCloudReflectRecapSchema.parse(await response.json())).toEqual(recap);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('rejects invalid query values before reading chat history', async () => {
    for (const query of ['?range=forever&timezone=UTC', '?range=30d&timezone=Not%2FAZone']) {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
    }
    expect(mockLoadRecap).not.toHaveBeenCalled();
  });

  it('returns a structured memory-required state without generating a recap', async () => {
    mockLoadRecap.mockResolvedValue({ kind: 'memory-disabled' });
    const response = await GET(request('?range=30d&timezone=UTC'));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: 'memory_required',
        message: 'Turn on Memory and Generate from past chats to view Reflect.',
      },
    });
  });

  it('returns 401 before loading recap data when there is no session', async () => {
    mockGetUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await GET(request('?range=30d&timezone=UTC'));
    expect(response.status).toBe(401);
    expect(mockLoadRecap).not.toHaveBeenCalled();
  });
});
