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

import { CLI_SIGNED_MANIFEST_ASSETS } from '@/lib/releases/github-cli-releases';
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

function signedManifestAssets(tagName: string) {
  const base = CLI_BASE_URL.replace(CLI_TAG, tagName);
  return CLI_SIGNED_MANIFEST_ASSETS.map((name, index) =>
    githubAsset(20 + index, name, `${base}/${name}`),
  );
}

function publishedCliRelease(tagName = CLI_TAG, signed = true) {
  const base = CLI_BASE_URL.replace(CLI_TAG, tagName);
  return githubRelease(1, tagName, [
    githubAsset(11, 'agiworkforce-darwin-arm64.tar.gz', `${base}/agiworkforce-darwin-arm64.tar.gz`),
    githubAsset(12, 'agiworkforce-linux-x64.tar.gz', `${base}/agiworkforce-linux-x64.tar.gz`),
    githubAsset(13, 'agiworkforce-win32-x64.zip', `${base}/agiworkforce-win32-x64.zip`),
    ...(signed ? signedManifestAssets(tagName) : []),
  ]);
}

function serveRelease(release: ReturnType<typeof githubRelease>, unavailable?: string) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const target =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (target.startsWith('https://api.github.com/repos/')) {
      return Response.json([release, githubRelease(2, 'v-desktop-1.2.0')]);
    }
    if (init?.method === 'HEAD') {
      const exists = release.assets.some((asset) => asset.browser_download_url === target);
      return new Response(null, { status: exists && target !== unavailable ? 200 : 404 });
    }
    return new Response(null, { status: 404 });
  });
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
    const release = publishedCliRelease();
    serveRelease(release);

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
    for (const asset of release.assets) {
      expect(fetchMock).toHaveBeenCalledWith(
        asset.browser_download_url,
        expect.objectContaining({ method: 'HEAD', cache: 'no-store', redirect: 'follow' }),
      );
    }
    for (const [, init] of fetchMock.mock.calls.filter(([, init]) => init?.method === 'HEAD')) {
      expect(init?.headers).toBeUndefined();
    }
  });

  it('reports the CLI as unavailable when the release carries no archive', async () => {
    const tagName = 'v-cli-1.1.0';
    serveRelease(githubRelease(1, tagName, signedManifestAssets(tagName)));

    const response = await getLatestCliRelease(makeRequest());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'No CLI release archive is published' },
    });
  });

  it('reports the CLI as unavailable when no CLI release has been tagged', async () => {
    serveRelease(githubRelease(1, 'v-desktop-1.2.0'));

    const response = await getLatestCliRelease(makeRequest());

    expect(response.status).toBe(404);
  });

  it('refuses an archive URL that is not a GitHub release download', async () => {
    const tagName = 'v-cli-1.2.0';
    const untrustedUrl = 'https://cdn.example.test/agiworkforce-linux-x64.tar.gz';
    serveRelease(
      githubRelease(1, tagName, [
        ...signedManifestAssets(tagName),
        githubAsset(11, 'agiworkforce-linux-x64.tar.gz', untrustedUrl),
      ]),
    );

    const response = await getLatestCliRelease(makeRequest());

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/api\.github\.com\/repos\/.*\/releases\?/),
      expect.any(Object),
    );
    expect(fetchMock.mock.calls.some(([input]) => input === untrustedUrl)).toBe(false);
  });

  it('refuses reachable archives without the complete signed manifest', async () => {
    const release = publishedCliRelease('v-cli-1.3.0', false);
    serveRelease(release);

    const response = await getLatestCliRelease(makeRequest());

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/api\.github\.com\/repos\/.*\/releases\?/),
      expect.any(Object),
    );
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'HEAD')).toBe(false);
  });

  it('refuses a signed manifest that an anonymous visitor cannot retrieve', async () => {
    const release = publishedCliRelease('v-cli-1.4.0');
    const signature = release.assets.find((asset) => asset.name === CLI_SIGNED_MANIFEST_ASSETS[1]);
    expect(signature).toBeDefined();
    serveRelease(release, signature!.browser_download_url);

    const response = await getLatestCliRelease(makeRequest());

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledWith(
      signature!.browser_download_url,
      expect.objectContaining({ method: 'HEAD' }),
    );
  });
});
