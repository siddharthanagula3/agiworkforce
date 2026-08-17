import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock, getOptionalEnvMock, withRateLimitMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getOptionalEnvMock: vi.fn(),
  withRateLimitMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: withRateLimitMock }));
vi.mock('@shared/utils/env', () => ({ getOptionalEnv: getOptionalEnvMock }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.stubGlobal('fetch', fetchMock);

import { GET as getLatestCliRelease } from '../cli/latest/route';

const CLI_TAG = 'v-cli-1.0.0';
const CLI_BASE_URL = `https://github.com/siddharthanagula3/agiworkforce/releases/download/${CLI_TAG}`;

function githubAsset(id: number, name: string, browserDownloadUrl: string) {
  return {
    id,
    name,
    browser_download_url: browserDownloadUrl,
    content_type: 'application/octet-stream',
    size: 2048,
    state: 'uploaded',
  };
}

function githubRelease(id: number, tagName: string, assets: ReturnType<typeof githubAsset>[] = []) {
  return {
    id,
    tag_name: tagName,
    name: tagName,
    body: `Notes for ${tagName}`,
    published_at: '2026-05-04T17:00:55Z',
    draft: false,
    prerelease: false,
    assets,
  };
}

function publishedCliRelease() {
  return githubRelease(1, CLI_TAG, [
    githubAsset(
      11,
      'agiworkforce-darwin-arm64.tar.gz',
      `${CLI_BASE_URL}/agiworkforce-darwin-arm64.tar.gz`,
    ),
    githubAsset(
      12,
      'agiworkforce-linux-x64.tar.gz',
      `${CLI_BASE_URL}/agiworkforce-linux-x64.tar.gz`,
    ),
    githubAsset(13, 'agiworkforce-win32-x64.zip', `${CLI_BASE_URL}/agiworkforce-win32-x64.zip`),
  ]);
}

function makeRequest(): never {
  return new Request('https://agiworkforce.com/api/releases/cli/latest', {
    method: 'GET',
  }) as never;
}

beforeEach(() => {
  withRateLimitMock.mockResolvedValue(null);
  getOptionalEnvMock.mockReturnValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/releases/cli/latest', () => {
  it('publishes a download for every archive the CLI release actually carries', async () => {
    fetchMock.mockResolvedValue(
      Response.json([publishedCliRelease(), githubRelease(2, 'v-desktop-1.2.0')]),
    );

    const response = await getLatestCliRelease(makeRequest());
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      version: string;
      downloads: Array<{ platform: string; assetName: string; downloadUrl: string }>;
    };
    expect(payload.version).toBe('1.0.0');
    expect(payload.downloads.map((download) => download.platform)).toEqual([
      'darwin-arm64',
      'linux-x64',
      'windows-x64',
    ]);
    for (const download of payload.downloads) {
      expect(download.downloadUrl.startsWith(`${CLI_BASE_URL}/`)).toBe(true);
    }
  });

  it('reports the CLI as unavailable when the release carries no archive', async () => {
    fetchMock.mockResolvedValue(Response.json([githubRelease(1, CLI_TAG)]));

    const response = await getLatestCliRelease(makeRequest());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'No CLI release archive is published' },
    });
  });

  it('reports the CLI as unavailable when no CLI release has been tagged', async () => {
    fetchMock.mockResolvedValue(Response.json([githubRelease(1, 'v-desktop-1.2.0')]));

    const response = await getLatestCliRelease(makeRequest());

    expect(response.status).toBe(404);
  });

  it('refuses an archive URL that is not a GitHub release download', async () => {
    fetchMock.mockResolvedValue(
      Response.json([
        githubRelease(1, CLI_TAG, [
          githubAsset(
            11,
            'agiworkforce-linux-x64.tar.gz',
            'https://cdn.example.test/agiworkforce-linux-x64.tar.gz',
          ),
        ]),
      ]),
    );

    const response = await getLatestCliRelease(makeRequest());

    expect(response.status).toBe(404);
  });
});
