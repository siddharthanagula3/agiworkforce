import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockVerifyCronRequest, mockPurge } = vi.hoisted(() => ({
  mockVerifyCronRequest: vi.fn(),
  mockPurge: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/cron-auth', () => ({ verifyCronRequest: mockVerifyCronRequest }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/resources/purge-soft-deleted', () => ({ purgeSoftDeletedResources: mockPurge }));

import { GET } from './route';

const FLAG = 'SOFT_DELETED_RESOURCE_PURGE_ENABLED';

function cronRequest(): NextRequest {
  return new NextRequest('http://localhost/api/cron/purge-soft-deleted-resources');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCronRequest.mockReturnValue(true);
  mockPurge.mockResolvedValue({ purged: 4, heldFromPurge: 1, skipped: 0, failed: 0, tables: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/cron/purge-soft-deleted-resources', () => {
  it('refuses an unsigned request', async () => {
    mockVerifyCronRequest.mockReturnValue(false);

    expect((await GET(cronRequest())).status).toBe(401);
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it('destroys nothing until an operator turns the purge on', async () => {
    for (const value of [undefined, '', 'false', '1', 'yes']) {
      if (value === undefined) vi.unstubAllEnvs();
      else vi.stubEnv(FLAG, value);

      const response = await GET(cronRequest());

      expect(response.status).toBe(200);
      expect(((await response.json()) as { purged: number }).purged).toBe(0);
    }
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it('purges and reports what a legal hold preserved once it is on', async () => {
    vi.stubEnv(FLAG, 'true');

    const body = (await (await GET(cronRequest())).json()) as {
      purged: number;
      heldFromPurge: number;
    };

    expect(mockPurge).toHaveBeenCalledOnce();
    expect(body).toMatchObject({ purged: 4, heldFromPurge: 1 });
  });

  it('answers 500 without leaking the failure when the purge throws', async () => {
    vi.stubEnv(FLAG, 'true');
    mockPurge.mockRejectedValue(new Error('connection refused at 10.0.0.5'));

    const response = await GET(cronRequest());

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('10.0.0.5');
  });
});
