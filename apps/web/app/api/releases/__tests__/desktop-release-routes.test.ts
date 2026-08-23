import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock, getOptionalEnvMock, withRateLimitMock, neonQueryMock, neonExecuteMock } =
  vi.hoisted(() => ({
    fetchMock: vi.fn(),
    getOptionalEnvMock: vi.fn(),
    withRateLimitMock: vi.fn(),
    neonQueryMock: vi.fn(),
    neonExecuteMock: vi.fn(),
  }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: withRateLimitMock }));
vi.mock('@shared/utils/env', () => ({ getOptionalEnv: getOptionalEnvMock }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: (...args: unknown[]) => neonQueryMock(...args),
    execute: (...args: unknown[]) => neonExecuteMock(...args),
  }),
}));

vi.stubGlobal('fetch', fetchMock);

import { GET as getTauriUpdate } from '../[target]/[version]/route';
import { GET as checkRelease } from '../check/route';
import { GET as getLatestRelease } from '../latest/[platform]/route';
import { GET as getLatestCloudRelease } from '../desktop-cloud/latest/route';
import { GET as downloadDesktop } from '../../download/route';

const RAW_APPIMAGE = 'AGI.Workforce_1.10.0_amd64.AppImage';
const RAW_APPIMAGE_URL = `https://github.com/siddharthanagula3/agiworkforce/releases/download/v-desktop-1.10.0/${RAW_APPIMAGE}`;
const RAW_SIGNATURE_URL = `${RAW_APPIMAGE_URL}.sig`;
const CLOUD_ARM64_DMG = 'AGI-Cloud-1.2.0-arm64.dmg';
const CLOUD_X64_DMG = 'AGI-Cloud-1.2.0-x64.dmg';
const CLOUD_RELEASE_BASE_URL =
  'https://github.com/siddharthanagula3/agiworkforce/releases/download/v-cloud-desktop-1.2.0';
const CLOUD_ARM64_DMG_URL = `${CLOUD_RELEASE_BASE_URL}/${CLOUD_ARM64_DMG}`;
const CLOUD_X64_DMG_URL = `${CLOUD_RELEASE_BASE_URL}/${CLOUD_X64_DMG}`;

function cloudDesktopRelease() {
  return githubRelease(20, 'v-cloud-desktop-1.2.0', {
    assets: [
      githubAsset(201, CLOUD_ARM64_DMG, CLOUD_ARM64_DMG_URL),
      githubAsset(202, CLOUD_X64_DMG, CLOUD_X64_DMG_URL),
    ],
  });
}

function githubAsset(id: number, name: string, browserDownloadUrl: string) {
  return {
    id,
    name,
    browser_download_url: browserDownloadUrl,
    content_type: 'application/octet-stream',
    size: 1024,
    state: 'uploaded',
  };
}

function githubRelease(
  id: number,
  tagName: string,
  options: {
    draft?: boolean;
    prerelease?: boolean;
    assets?: ReturnType<typeof githubAsset>[];
  } = {},
) {
  return {
    id,
    tag_name: tagName,
    name: tagName,
    body: `Notes for ${tagName}`,
    published_at: '2026-07-15T00:00:00Z',
    draft: options.draft ?? false,
    prerelease: options.prerelease ?? false,
    assets: options.assets ?? [],
  };
}

function githubReleaseList() {
  return [
    githubRelease(1, 'v-cli-99.0.0'),
    githubRelease(2, 'v-desktop-1.9.9'),
    githubRelease(3, 'v-desktop-2.0.0', { draft: true }),
    githubRelease(4, 'v-desktop-3.0.0', { prerelease: true }),
    githubRelease(5, 'v-desktop-1.10.0', {
      assets: [
        githubAsset(51, `${RAW_APPIMAGE}.tar.gz`, `${RAW_APPIMAGE_URL}.tar.gz`),
        githubAsset(52, RAW_APPIMAGE, RAW_APPIMAGE_URL),
        githubAsset(53, `${RAW_APPIMAGE}.sig`, RAW_SIGNATURE_URL),
      ],
    }),
  ];
}

function updaterRelease(id: number, version: string, prerelease: boolean) {
  const tag = `v-desktop-${version}`;
  const name = `AGI.Workforce_${version}_amd64.AppImage`;
  const url = `https://github.com/siddharthanagula3/agiworkforce/releases/download/${tag}/${name}`;
  return {
    release: githubRelease(id, tag, {
      prerelease,
      assets: [
        githubAsset(id * 10 + 1, name, url),
        githubAsset(id * 10 + 2, `${name}.sig`, `${url}.sig`),
      ],
    }),
    url,
  };
}

function makeRequest(url: string): never {
  return new Request(url, { method: 'GET' }) as never;
}

const UNTRUSTED_ASSET_URL = 'https://evil.example.com/agi.AppImage';

function useDatabaseReleaseRow(row: Record<string, unknown>) {
  getOptionalEnvMock.mockImplementation((name: string) =>
    name === 'DATABASE_URL' ? 'postgres://releases.test/db' : undefined,
  );
  neonQueryMock.mockResolvedValue([row]);
}

beforeEach(() => {
  withRateLimitMock.mockResolvedValue(null);
  neonQueryMock.mockResolvedValue([]);
  neonExecuteMock.mockResolvedValue(undefined);
  getOptionalEnvMock.mockImplementation((name: string) => {
    if (name === 'DESKTOP_GITHUB_OWNER') return 'siddharthanagula3';
    if (name === 'DESKTOP_GITHUB_REPO') return 'agiworkforce';
    return undefined;
  });
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith('https://github.com/') && url.endsWith('.sig')) {
      return new Response('tauri-signature\n', { status: 200 });
    }
    if (url === RAW_APPIMAGE_URL) {
      return new Response('appimage-bytes', {
        status: 200,
        headers: {
          'content-length': '14',
          'content-type': 'application/octet-stream',
        },
      });
    }
    return Response.json(githubReleaseList());
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('desktop release routes', () => {
  it('returns the newest stable signed desktop AppImage from the Tauri updater route', async () => {
    const response = await getTauriUpdate(
      makeRequest('https://agi.example/api/releases/linux-x86_64/1.9.0'),
      { params: Promise.resolve({ target: 'linux-x86_64', version: '1.9.0' }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      version: '1.10.0',
      notes: 'Notes for v-desktop-1.10.0',
      pub_date: '2026-07-15T00:00:00Z',
      platforms: {
        'linux-x86_64': {
          url: RAW_APPIMAGE_URL,
          signature: 'tauri-signature',
        },
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/releases\?per_page=/),
      expect.any(Object),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/releases\/latest$/),
      expect.any(Object),
    );
  });

  it('uses the normalized desktop semantic version in the release check fallback', async () => {
    const response = await checkRelease(
      makeRequest('https://agi.example/api/releases/check?version=1.9.0&platform=linux-x86_64'),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      update_available: true,
      current_version: '1.9.0',
      latest_version: '1.10.0',
      download_url: 'https://agiworkforce.com/api/releases/latest/linux-x86_64?channel=stable',
    });
  });

  it('returns a Tauri manifest backed by the raw signed AppImage from the latest route', async () => {
    const response = await getLatestRelease(
      makeRequest('https://agi.example/api/releases/latest/linux-x86_64'),
      { params: Promise.resolve({ platform: 'linux-x86_64' }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      version: '1.10.0',
      platforms: {
        'linux-x86_64': {
          url: RAW_APPIMAGE_URL,
          signature: 'tauri-signature',
        },
      },
    });
  });

  it('returns no update when GitHub returns a malformed release payload', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ tag_name: 'v-desktop-9.9.9' }));

    const response = await getTauriUpdate(
      makeRequest('https://agi.example/api/releases/linux-x86_64/1.9.0'),
      { params: Promise.resolve({ target: 'linux-x86_64', version: '1.9.0' }) },
    );

    expect(response.status).toBe(204);
  });

  it('returns no update when the selected desktop asset has no matching signature', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json([
        githubRelease(6, 'v-desktop-1.10.0', {
          assets: [githubAsset(61, RAW_APPIMAGE, RAW_APPIMAGE_URL)],
        }),
      ]),
    );

    const response = await getTauriUpdate(
      makeRequest('https://agi.example/api/releases/linux-x86_64/1.9.0'),
      { params: Promise.resolve({ target: 'linux-x86_64', version: '1.9.0' }) },
    );

    expect(response.status).toBe(204);
  });

  it('never fetches a release signature from an untrusted host', async () => {
    const untrustedSignatureUrl = `https://metadata.internal.example/${RAW_APPIMAGE}.sig`;
    fetchMock.mockResolvedValueOnce(
      Response.json([
        githubRelease(6, 'v-desktop-1.10.0', {
          assets: [
            githubAsset(61, RAW_APPIMAGE, RAW_APPIMAGE_URL),
            githubAsset(62, `${RAW_APPIMAGE}.sig`, untrustedSignatureUrl),
          ],
        }),
      ]),
    );

    const response = await getTauriUpdate(
      makeRequest('https://agi.example/api/releases/linux-x86_64/1.9.0'),
      { params: Promise.resolve({ target: 'linux-x86_64', version: '1.9.0' }) },
    );

    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalledWith(untrustedSignatureUrl, expect.any(Object));
  });

  it('streams a desktop installer from the newest stable desktop release', async () => {
    const response = await downloadDesktop(
      makeRequest('https://agi.example/api/download?platform=linux'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain(
      'filename="agiworkforce.AppImage"',
    );
    expect(await response.text()).toBe('appimage-bytes');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/releases\?per_page=/),
      expect.any(Object),
    );
  });

  it('reports the exact AGI Cloud macOS architectures that are published', async () => {
    fetchMock.mockResolvedValue(Response.json([cloudDesktopRelease()]));

    const response = await getLatestCloudRelease(
      makeRequest('https://agi.example/api/releases/desktop-cloud/latest'),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      version: '1.2.0',
      platforms: { mac: true },
      architectures: { arm64: true, x64: true },
    });
  });

  it('streams the requested AGI Cloud architecture without cross-architecture fallback', async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === CLOUD_X64_DMG_URL) {
        return new Response('x64-dmg-bytes', {
          status: 200,
          headers: { 'content-length': '13', 'content-type': 'application/x-apple-diskimage' },
        });
      }
      return Response.json([cloudDesktopRelease()]);
    });

    const response = await downloadDesktop(
      makeRequest('https://agi.example/api/download?platform=mac&app=cloud&arch=x64'),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('x64-dmg-bytes');
    expect(fetchMock).toHaveBeenCalledWith(CLOUD_X64_DMG_URL, expect.any(Object));
    expect(fetchMock).not.toHaveBeenCalledWith(CLOUD_ARM64_DMG_URL, expect.any(Object));
  });

  it('rejects an unknown AGI Cloud architecture before fetching a release', async () => {
    const response = await downloadDesktop(
      makeRequest('https://agi.example/api/download?platform=mac&app=cloud&arch=universal'),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves the download route allowlist for selected release assets', async () => {
    const untrustedUrl = `https://downloads.evil.example/${RAW_APPIMAGE}`;
    fetchMock.mockResolvedValueOnce(
      Response.json([
        githubRelease(7, 'v-desktop-1.10.0', {
          assets: [githubAsset(71, RAW_APPIMAGE, untrustedUrl)],
        }),
      ]),
    );

    const response = await downloadDesktop(
      makeRequest('https://agi.example/api/download?platform=linux'),
    );

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalledWith(untrustedUrl, expect.any(Object));
  });

  it('refuses an update manifest whose release row points at an untrusted asset host', async () => {
    useDatabaseReleaseRow({
      id: 'release-1',
      version: '1.10.0',
      platform: 'linux-x86_64',
      download_url: UNTRUSTED_ASSET_URL,
      signature: 'tauri-signature',
      notes: null,
      pub_date: '2026-07-15T00:00:00Z',
      file_size_bytes: 1024,
      is_critical: false,
    });

    const response = await getLatestRelease(
      makeRequest('https://agi.example/api/releases/latest/linux-x86_64'),
      { params: Promise.resolve({ platform: 'linux-x86_64' }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(neonExecuteMock).not.toHaveBeenCalled();
  });

  it('omits the check-route download_url when the release row points at an untrusted asset host', async () => {
    useDatabaseReleaseRow({
      version: '1.10.0',
      download_url: UNTRUSTED_ASSET_URL,
      notes: 'Notes for v-desktop-1.10.0',
      pub_date: '2026-07-15T00:00:00Z',
      file_size_bytes: 1024,
      is_critical: false,
    });

    const response = await checkRelease(
      makeRequest('https://agi.example/api/releases/check?version=1.9.0&platform=linux-x86_64'),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      update_available: true,
      latest_version: '1.10.0',
      download_url: null,
      release_notes: 'Notes for v-desktop-1.10.0',
    });
  });

  it('finds the stable desktop release when other product releases fill an earlier page', async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === RAW_SIGNATURE_URL) {
        return new Response('tauri-signature', { status: 200 });
      }
      if (url.includes('page=2')) {
        return Response.json([
          githubRelease(8, 'v-desktop-1.10.0', {
            assets: [
              githubAsset(81, RAW_APPIMAGE, RAW_APPIMAGE_URL),
              githubAsset(82, `${RAW_APPIMAGE}.sig`, RAW_SIGNATURE_URL),
            ],
          }),
        ]);
      }
      return Response.json([githubRelease(9, 'v-cli-99.0.0')], {
        headers: {
          link: '<https://api.github.com/repos/siddharthanagula3/agiworkforce/releases?per_page=100&page=2>; rel="next"',
        },
      });
    });

    const response = await getTauriUpdate(
      makeRequest('https://agi.example/api/releases/linux-x86_64/1.9.0'),
      { params: Promise.resolve({ target: 'linux-x86_64', version: '1.9.0' }) },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.any(Object));
  });

  it('keeps beta and nightly Tauri clients on their inferred release channels', async () => {
    const beta = updaterRelease(10, '1.11.0-beta.2', true);
    const olderBeta = updaterRelease(11, '1.11.0-beta.1', true);
    const nightly = updaterRelease(12, '1.12.0-nightly.4', true);
    const newerStable = updaterRelease(13, '9.0.0', false);
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('https://github.com/') && url.endsWith('.sig')) {
        return new Response('channel-signature\n', { status: 200 });
      }
      return Response.json([newerStable.release, nightly.release, olderBeta.release, beta.release]);
    });

    const betaResponse = await getTauriUpdate(
      makeRequest('https://agi.example/api/releases/linux-x86_64/1.11.0-beta.1'),
      {
        params: Promise.resolve({
          target: 'linux-x86_64',
          version: '1.11.0-beta.1',
        }),
      },
    );
    expect(betaResponse.status).toBe(200);
    expect(await betaResponse.json()).toMatchObject({
      version: '1.11.0-beta.2',
      platforms: { 'linux-x86_64': { url: beta.url } },
    });

    const nightlyResponse = await getTauriUpdate(
      makeRequest('https://agi.example/api/releases/linux-x86_64/1.12.0-nightly.3'),
      {
        params: Promise.resolve({
          target: 'linux-x86_64',
          version: '1.12.0-nightly.3',
        }),
      },
    );
    expect(nightlyResponse.status).toBe(200);
    expect(await nightlyResponse.json()).toMatchObject({
      version: '1.12.0-nightly.4',
      platforms: { 'linux-x86_64': { url: nightly.url } },
    });
  });

  it('serves beta and nightly GitHub fallbacks only when explicitly requested', async () => {
    const beta = updaterRelease(14, '2.0.0-beta.3', true);
    const nightly = updaterRelease(15, '2.1.0-nightly.5', true);
    const stable = updaterRelease(16, '8.0.0', false);
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('https://github.com/') && url.endsWith('.sig')) {
        return new Response('channel-signature\n', { status: 200 });
      }
      return Response.json([stable.release, nightly.release, beta.release]);
    });

    const betaCheck = await checkRelease(
      makeRequest(
        'https://agi.example/api/releases/check?version=1.9.0-beta.1&platform=linux-x86_64&channel=beta',
      ),
    );
    expect(betaCheck.status).toBe(200);
    expect(await betaCheck.json()).toMatchObject({
      latest_version: '2.0.0-beta.3',
      download_url: 'https://agiworkforce.com/api/releases/latest/linux-x86_64?channel=beta',
    });

    const nightlyManifest = await getLatestRelease(
      makeRequest('https://agi.example/api/releases/latest/linux-x86_64?channel=nightly'),
      { params: Promise.resolve({ platform: 'linux-x86_64' }) },
    );
    expect(nightlyManifest.status).toBe(200);
    expect(await nightlyManifest.json()).toMatchObject({
      version: '2.1.0-nightly.5',
      platforms: { 'linux-x86_64': { url: nightly.url } },
    });
  });

  it('serves desktop updates from the default repository when the release env vars are unset', async () => {
    getOptionalEnvMock.mockReturnValue(undefined);

    const updaterResponse = await getTauriUpdate(
      makeRequest('https://agi.example/api/releases/linux-x86_64/1.9.0'),
      { params: Promise.resolve({ target: 'linux-x86_64', version: '1.9.0' }) },
    );
    expect(updaterResponse.status).toBe(200);
    expect(await updaterResponse.json()).toMatchObject({
      version: '1.10.0',
      platforms: { 'linux-x86_64': { url: RAW_APPIMAGE_URL, signature: 'tauri-signature' } },
    });

    const latestResponse = await getLatestRelease(
      makeRequest('https://agi.example/api/releases/latest/linux-x86_64'),
      { params: Promise.resolve({ platform: 'linux-x86_64' }) },
    );
    expect(latestResponse.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://api.github.com/repos/siddharthanagula3/agiworkforce/releases',
      ),
      expect.any(Object),
    );
  });

  it('rejects unknown release channels instead of falling back to stable', async () => {
    const response = await getLatestRelease(
      makeRequest('https://agi.example/api/releases/latest/linux-x86_64?channel=preview'),
      { params: Promise.resolve({ platform: 'linux-x86_64' }) },
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
