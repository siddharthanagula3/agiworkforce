import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { NextRequest } from 'next/server';

import { CHECKSUM_ASSET_NAME, GET, parseChecksumFile } from '../checksums/route';

const RELEASE_BASE =
  'https://github.com/siddharthanagula3/agiworkforce/releases/download/v-cloud-desktop-1.2.0';
const ARM64_DMG = 'AGI-Cloud-1.2.0-arm64.dmg';
const X64_DMG = 'AGI-Cloud-1.2.0-x64.dmg';
const ARM64_SHA = 'a'.repeat(64);
const X64_SHA = 'b'.repeat(64);

function githubAsset(id: number, name: string) {
  return {
    id,
    name,
    browser_download_url: `${RELEASE_BASE}/${name}`,
    content_type: 'application/octet-stream',
    size: 1024,
    state: 'uploaded',
  };
}

function release(assetNames: string[]) {
  return [
    {
      id: 20,
      tag_name: 'v-cloud-desktop-1.2.0',
      name: 'v-cloud-desktop-1.2.0',
      body: 'notes',
      published_at: '2026-07-15T00:00:00Z',
      draft: false,
      prerelease: false,
      assets: assetNames.map((name, index) => githubAsset(200 + index, name)),
    },
  ];
}

const CHECKSUM_BODY = `${ARM64_SHA}  ${ARM64_DMG}\n${X64_SHA} *${X64_DMG}\n`;

function respond(assetNames: string[], checksumBody: string | null) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url.endsWith(`/${CHECKSUM_ASSET_NAME}`)) {
      return Promise.resolve(
        checksumBody === null
          ? new Response('missing', { status: 404 })
          : new Response(checksumBody, { status: 200 }),
      );
    }
    return Promise.resolve(Response.json(release(assetNames)));
  });
}

function request() {
  return new NextRequest('https://agiworkforce.com/api/download/checksums');
}

beforeEach(() => {
  withRateLimitMock.mockResolvedValue(null);
  getOptionalEnvMock.mockReturnValue(undefined);
  respond([ARM64_DMG, X64_DMG, CHECKSUM_ASSET_NAME], CHECKSUM_BODY);
});

describe('parseChecksumFile', () => {
  it('reads both shasum formats and ignores anything that is not an installer', () => {
    expect(
      parseChecksumFile(
        `${CHECKSUM_BODY}${'c'.repeat(64)}  agiworkforce-darwin-arm64.tar.gz\nnot a checksum line\n`,
      ),
    ).toEqual([
      { name: ARM64_DMG, architecture: 'arm64', sha256: ARM64_SHA },
      { name: X64_DMG, architecture: 'x64', sha256: X64_SHA },
    ]);
  });

  it('refuses a line whose digest is not a sha256', () => {
    expect(parseChecksumFile(`deadbeef  ${ARM64_DMG}\n`)).toEqual([]);
  });
});

describe('GET /api/download/checksums', () => {
  it('serves the published digest for each installer in the release', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      version: '1.2.0',
      algorithm: 'sha256',
      installers: [
        { name: ARM64_DMG, architecture: 'arm64', sha256: ARM64_SHA },
        { name: X64_DMG, architecture: 'x64', sha256: X64_SHA },
      ],
    });
  });

  it('answers 404 when the release publishes no checksum asset', async () => {
    respond([ARM64_DMG, X64_DMG], null);

    const response = await GET(request());

    expect(response.status).toBe(404);
  });

  it('answers 404 rather than an empty list when the checksum file covers no installer', async () => {
    respond([ARM64_DMG, CHECKSUM_ASSET_NAME], `${ARM64_SHA}  notes.txt\n`);

    const response = await GET(request());

    expect(response.status).toBe(404);
  });
});
