import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ readServiceNotices: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/service-notices', () => ({
  readServiceNotices: mocks.readServiceNotices,
}));

import { GET } from '../route';

describe('GET /api/status/notices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the active notices with a shared cache header', async () => {
    const notices = [
      { id: 'n-1', severity: 'degraded', title: 'Slow responses', body: 'Investigating.' },
    ];
    mocks.readServiceNotices.mockResolvedValue(notices);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notices });
    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=60, stale-while-revalidate=60',
    );
    expect(mocks.readServiceNotices).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list when nothing is posted', async () => {
    mocks.readServiceNotices.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notices: [] });
  });

  it('turns a notice store failure into a server error', async () => {
    mocks.readServiceNotices.mockRejectedValue(new Error('store down'));

    const response = await GET();

    expect(response.status).toBe(500);
  });
});
