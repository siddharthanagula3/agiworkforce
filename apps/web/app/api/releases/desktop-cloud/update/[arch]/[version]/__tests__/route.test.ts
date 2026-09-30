import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  fetchLatestDesktopRelease: vi.fn(),
  desktopUpdateHeld: vi.fn(),
  getOptionalEnv: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  REDIS_OUTAGE_POLICY_ENV: 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY',
  acquireManagedTurnSlot: vi.fn(),
  checkRateLimit: vi.fn(),
  clientIpRateLimitIdentifier: vi.fn(),
  getClientIpForRateLimit: vi.fn(),
  isSharedStoreQuotaExhausted: vi.fn(),
  rateLimitConfigs: vi.fn(),
  readManagedTurnSlots: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  resolveTierRateLimit: vi.fn(),
  withRateLimitHandler: vi.fn(),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@shared/utils/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/utils/env')>()),
  getOptionalEnv: mocks.getOptionalEnv,
}));
vi.mock('@/lib/releases/github-desktop-releases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/releases/github-desktop-releases')>()),
  fetchLatestDesktopRelease: mocks.fetchLatestDesktopRelease,
}));
vi.mock('@/lib/releases/desktop-update-hold', () => ({
  DESKTOP_UPDATE_VARY_HEADER: vi.fn(),
  desktopUpdateHeld: mocks.desktopUpdateHeld,
}));

import { GET } from '../route';

function call(arch: string, version: string) {
  return GET(
    new NextRequest(`http://localhost/api/releases/desktop-cloud/update/${arch}/${version}`),
    {
      params: Promise.resolve({ arch, version }),
    },
  );
}

const release = {
  id: 1,
  tagName: 'v-cloud-desktop-1.3.0',
  version: '1.3.0',
  notes: 'Faster sync',
  publishedAt: '2026-09-20T00:00:00.000Z',
  assets: [
    { id: 1, name: 'AGI-1.3.0-arm64.zip', browserDownloadUrl: 'https://dl/arm64.zip', size: 1 },
    { id: 2, name: 'AGI-1.3.0-x64.zip', browserDownloadUrl: 'https://dl/x64.zip', size: 1 },
    { id: 3, name: 'AGI-1.3.0-arm64.dmg', browserDownloadUrl: 'https://dl/arm64.dmg', size: 1 },
  ],
};

describe('GET /api/releases/desktop-cloud/update/[arch]/[version]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.desktopUpdateHeld.mockResolvedValue(false);
    mocks.getOptionalEnv.mockReturnValue(undefined);
    mocks.fetchLatestDesktopRelease.mockResolvedValue(release);
  });

  it('returns the rate limit response', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    const response = await call('arm64', '1.2.0');

    expect(response.status).toBe(429);
    expect(mocks.fetchLatestDesktopRelease).not.toHaveBeenCalled();
  });

  it.each([
    ['riscv', '1.2.0'],
    ['arm64', 'not-a-version'],
  ])('answers no update for arch %s version %s without fetching', async (arch, version) => {
    const response = await call(arch, version);

    expect(response.status).toBe(204);
    expect(mocks.fetchLatestDesktopRelease).not.toHaveBeenCalled();
  });

  it('answers no update while the rollout is held for this client', async () => {
    mocks.desktopUpdateHeld.mockResolvedValue(true);

    const response = await call('arm64', '1.2.0');

    expect(response.status).toBe(204);
    expect(mocks.desktopUpdateHeld).toHaveBeenCalledWith(expect.anything(), '1.2.0');
    expect(mocks.fetchLatestDesktopRelease).not.toHaveBeenCalled();
  });

  it('answers no update when the client is already current', async () => {
    const response = await call('arm64', '1.3.0');

    expect(response.status).toBe(204);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=60');
  });

  it('answers no update when there is no archive for the architecture', async () => {
    mocks.fetchLatestDesktopRelease.mockResolvedValue({ ...release, assets: [release.assets[2]] });

    const response = await call('arm64', '1.2.0');

    expect(response.status).toBe(204);
  });

  it('serves the matching zip archive from the cloud release line', async () => {
    const response = await call('x64', '1.2.0');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=300');
    expect(await response.json()).toEqual({
      url: 'https://dl/x64.zip',
      name: '1.3.0',
      notes: 'Faster sync',
      pub_date: '2026-09-20T00:00:00.000Z',
    });
    expect(mocks.fetchLatestDesktopRelease).toHaveBeenCalledWith('stable', {
      tagPrefix: 'v-cloud-desktop-',
      owner: 'siddharthanagula3',
      repo: 'agiworkforce',
    });
  });

  it('reads the release repository from the environment when set', async () => {
    mocks.getOptionalEnv.mockImplementation((key: string) =>
      key === 'DESKTOP_CLOUD_GITHUB_OWNER' ? 'fork-owner' : 'fork-repo',
    );

    await call('arm64', '1.2.0');

    expect(mocks.fetchLatestDesktopRelease).toHaveBeenCalledWith(
      'stable',
      expect.objectContaining({ owner: 'fork-owner', repo: 'fork-repo' }),
    );
  });
});
