import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const { fetchMock, withRateLimitMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  withRateLimitMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: withRateLimitMock,
}));

vi.stubGlobal('fetch', fetchMock);

import { CLI_RELEASE_PLATFORMS } from '@/lib/releases/github-cli-releases';
import { DESKTOP_CLOUD_TAG_PREFIX } from '@/lib/releases/github-desktop-releases';
import { GET as getLatestCliRelease } from '@/app/api/releases/cli/latest/route';
import { GET as getLatestDesktopRelease } from '@/app/api/releases/desktop-cloud/latest/route';
import { CliDownloadAvailability } from '../CliDownloadAvailability';
import { DesktopDownloadAvailability } from '../DesktopDownloadAvailability';

const GITHUB_RELEASES = 'https://api.github.com/repos/siddharthanagula3/agiworkforce/releases';
const DOWNLOAD_ROOT = 'https://github.com/siddharthanagula3/agiworkforce/releases/download';

const OS_NAMES: Record<string, RegExp> = {
  darwin: /\bmacOS\b/,
  linux: /\bLinux\b/,
  windows: /\bWindows\b/,
};

const ARCHITECTURE_NAMES: Record<string, RegExp> = {
  arm64: /\bApple silicon\b|\barm64\b/,
  x64: /\bIntel\b|\bx64\b/,
};

function archiveName(platform: string): string {
  return `agiworkforce-${platform}.${platform.startsWith('windows') ? 'zip' : 'tar.gz'}`;
}

let assetId = 1;

function githubRelease(tag: string, prerelease: boolean, assetNames: readonly string[]) {
  assetId += 1;
  return {
    id: assetId,
    tag_name: tag,
    name: tag,
    body: null,
    published_at: '2026-09-01T00:00:00Z',
    draft: false,
    prerelease,
    assets: assetNames.map((name) => {
      assetId += 1;
      return {
        id: assetId,
        name,
        browser_download_url: `${DOWNLOAD_ROOT}/${tag}/${name}`,
        size: 2048,
        state: 'uploaded',
      };
    }),
  };
}

const DESKTOP_INSTALLERS = ['AGI.Cloud_arm64.dmg', 'AGI.Cloud_x64.dmg'];
const CLI_ARCHIVES = ['darwin-arm64', 'linux-x64'].map(archiveName);

const PUBLISHED_RELEASES = [
  githubRelease(`${DESKTOP_CLOUD_TAG_PREFIX}1.6.0-nightly.3`, true, DESKTOP_INSTALLERS),
  githubRelease(`${DESKTOP_CLOUD_TAG_PREFIX}1.5.0-beta.2`, true, DESKTOP_INSTALLERS),
  githubRelease(`${DESKTOP_CLOUD_TAG_PREFIX}1.5.0-rc.1`, false, DESKTOP_INSTALLERS),
  githubRelease(`${DESKTOP_CLOUD_TAG_PREFIX}1.4.0`, false, DESKTOP_INSTALLERS),
  githubRelease('v-cli-2.1.0-beta.1', true, CLI_ARCHIVES),
  githubRelease('v-cli-2.0.0-rc.2', false, CLI_ARCHIVES),
  githubRelease('v-cli-2.0.0-nightly.9', true, CLI_ARCHIVES),
  githubRelease('v-cli-1.9.0', false, CLI_ARCHIVES),
];

const UNSTABLE_VERSIONS = ['1.6.0', '1.5.0', '2.1.0', '2.0.0'];

function url(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

function serveThroughReleaseRoutes(): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = url(input);
    if (target === '/api/releases/cli/latest') {
      return getLatestCliRelease(new Request(`https://agiworkforce.com${target}`) as never);
    }
    if (target === '/api/releases/desktop-cloud/latest') {
      return getLatestDesktopRelease(new Request(`https://agiworkforce.com${target}`) as never);
    }
    if (target.startsWith(GITHUB_RELEASES)) return Response.json(PUBLISHED_RELEASES);
    if (target.startsWith(DOWNLOAD_ROOT) && init?.method === 'HEAD') {
      return new Response(null, { status: 200 });
    }
    return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  });
}

beforeEach(() => {
  withRateLimitMock.mockResolvedValue(null);
  serveThroughReleaseRoutes();
});

describe('what /download offers comes from the stable channel it says it reads', () => {
  it('offers the stable desktop installer even when a newer beta, nightly or candidate is tagged', async () => {
    render(<DesktopDownloadAvailability />);

    const region = await screen.findByRole('region', { name: 'Desktop installer availability' });
    expect(await within(region).findByText(/version 1\.4\.0/)).toBeInTheDocument();
    for (const version of UNSTABLE_VERSIONS) {
      expect(region).not.toHaveTextContent(version);
    }
  });

  it('links only the stable CLI archives, never a newer beta, nightly or candidate build', async () => {
    render(<CliDownloadAvailability />);

    const region = await screen.findByRole('region', { name: 'CLI archive availability' });
    expect(await within(region).findByText('agi CLI · version 1.9.0')).toBeInTheDocument();
    const hrefs = within(region)
      .getAllByRole('link', { name: /^Download / })
      .map((link) => link.getAttribute('href') ?? '');
    expect(hrefs).toHaveLength(CLI_ARCHIVES.length);
    for (const href of hrefs) expect(href).toContain('/v-cli-1.9.0/');
    for (const version of UNSTABLE_VERSIONS) {
      expect(region).not.toHaveTextContent(version);
    }
  });
});

describe('platform labels on /download', () => {
  it('labels every CLI platform the release channel can publish with its own OS and architecture', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        version: '1.9.0',
        publishedAt: '2026-09-01T00:00:00Z',
        downloads: CLI_RELEASE_PLATFORMS.map((platform) => ({
          platform,
          assetName: archiveName(platform),
          downloadUrl: `${DOWNLOAD_ROOT}/v-cli-1.9.0/${archiveName(platform)}`,
          sizeBytes: 2048,
        })),
      }),
    );
    render(<CliDownloadAvailability />);

    const archives = await screen.findByRole('list', { name: 'CLI archives' });
    const rows = within(archives).getAllByRole('listitem');
    expect(rows).toHaveLength(CLI_RELEASE_PLATFORMS.length);

    for (const platform of CLI_RELEASE_PLATFORMS) {
      const [os, architecture] = platform.split('-') as [string, string];
      const link = within(archives).getByRole('link', {
        name: `Download ${archiveName(platform)}`,
      });
      const row = link.closest('li');
      const label = row?.querySelector('.agi-ds-ledger-label')?.textContent ?? '';
      expect(label).toMatch(OS_NAMES[os]!);
      expect(label).toMatch(ARCHITECTURE_NAMES[architecture]!);
      expect(label).not.toContain(platform);
    }
  });
});
