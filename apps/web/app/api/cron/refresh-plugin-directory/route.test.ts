import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const cron = vi.hoisted(() => ({ verifyCronRequest: vi.fn() }));
vi.mock('@/lib/server/cron-auth', () => cron);

const ingest = vi.hoisted(() => ({
  ingestPluginDirectory: vi.fn(),
  ingestBudgetForMaxDuration: vi.fn(() => ({
    manifestMs: 1,
    publicMs: 2,
    inspectionMs: 3,
    totalMs: 4,
  })),
}));
vi.mock('@/features/plugins/server/directory/ingest', () => ingest);

import { NextRequest } from 'next/server';
import { GET, maxDuration } from './route';

function get(path = '/api/cron/refresh-plugin-directory'): NextRequest {
  return new NextRequest(`https://agiworkforce.com${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  cron.verifyCronRequest.mockReturnValue(true);
  ingest.ingestPluginDirectory.mockResolvedValue({ totalRecords: 3 });
});

describe('GET /api/cron/refresh-plugin-directory', () => {
  it('runs the ingest with the budget derived from maxDuration', async () => {
    const response = await GET(get());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ totalRecords: 3 });
    expect(maxDuration).toBeGreaterThan(0);
    expect(ingest.ingestPluginDirectory).toHaveBeenCalledWith({
      budget: { manifestMs: 1, publicMs: 2, inspectionMs: 3, totalMs: 4 },
      rebuild: false,
    });
  });

  it('passes mode=rebuild through', async () => {
    await GET(get('/api/cron/refresh-plugin-directory?mode=rebuild'));
    expect(ingest.ingestPluginDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ rebuild: true }),
    );
  });

  it('refuses an unauthenticated caller before touching the ingest', async () => {
    cron.verifyCronRequest.mockReturnValue(false);
    const response = await GET(get());
    expect(response.status).toBe(401);
    expect(ingest.ingestPluginDirectory).not.toHaveBeenCalled();
  });

  it('maps a held lease to its status and hides other failures', async () => {
    const { createError } = await import('@/lib/errors');
    ingest.ingestPluginDirectory.mockRejectedValueOnce(createError.conflict('running'));
    expect((await GET(get())).status).toBe(409);
    ingest.ingestPluginDirectory.mockRejectedValueOnce(new Error('github down'));
    const failed = await GET(get());
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain('github down');
  });
});
