import { afterEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('../github-desktop-releases');

vi.mock('../github-desktop-releases', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return { ...actual, fetchLatestDesktopRelease: vi.fn() };
});

import { fetchLatestDesktopRelease } from '../github-desktop-releases';
import { CLI_SIGNED_MANIFEST_ASSETS, fetchCliReleaseAvailability } from '../github-cli-releases';

// Reachability is cached per URL for the life of the process, which is what we
// want in production but would let one case answer for the next. Each case gets
// its own release version, so its asset URLs are its own.
function release(version: string, { signed = true }: { signed?: boolean } = {}) {
  const base = `https://github.com/siddharthanagula3/agiworkforce/releases/download/v-cli-${version}`;
  const manifest = signed
    ? CLI_SIGNED_MANIFEST_ASSETS.map((name) => ({
        name,
        size: 512,
        browserDownloadUrl: `${base}/${name}`,
      }))
    : [];
  return {
    version,
    publishedAt: '2026-05-03T13:52:30Z',
    assets: [
      {
        name: 'agiworkforce-darwin-arm64.tar.gz',
        size: 3426642,
        browserDownloadUrl: `${base}/agiworkforce-darwin-arm64.tar.gz`,
      },
      {
        name: 'agiworkforce-linux-x64.tar.gz',
        size: 3915467,
        browserDownloadUrl: `${base}/agiworkforce-linux-x64.tar.gz`,
      },
      ...manifest,
    ],
  };
}

describe('CLI release availability is gated on public reachability', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // The release lookup runs with a GitHub token, so a private repository still
  // reports its assets. Those URLs answer 404 for every real visitor, and the
  // download surface must not advertise them.
  it('advertises nothing when the assets are not publicly retrievable', async () => {
    vi.mocked(fetchLatestDesktopRelease).mockResolvedValue(release('1.0.0') as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(fetchCliReleaseAvailability()).resolves.toBeNull();
  });

  it('advertises only the assets an anonymous request can actually fetch', async () => {
    vi.mocked(fetchLatestDesktopRelease).mockResolvedValue(release('2.0.0') as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) =>
        String(url).includes('linux-x64') || String(url).includes('SHA256SUMS')
          ? new Response(null, { status: 200 })
          : new Response(null, { status: 404 }),
      ),
    );
    const availability = await fetchCliReleaseAvailability();
    expect(availability?.downloads.map((d) => d.platform)).toEqual(['linux-x64']);
  });

  it('probes without credentials, the way a visitor would', async () => {
    vi.mocked(fetchLatestDesktopRelease).mockResolvedValue(release('3.0.0') as never);
    const spy = vi.fn(
      async (_url: unknown, _init?: RequestInit) => new Response(null, { status: 200 }),
    );
    vi.stubGlobal('fetch', spy);
    await fetchCliReleaseAvailability();
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    for (const call of spy.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      expect(init?.method).toBe('HEAD');
      expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/authorization|token/i);
    }
  });

  // The installer and agi update refuse a release whose checksum manifest is
  // unsigned, so the feed must not offer one they would refuse to install.
  it('advertises nothing when the release carries no signed checksum manifest', async () => {
    vi.mocked(fetchLatestDesktopRelease).mockResolvedValue(
      release('5.0.0', { signed: false }) as never,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    await expect(fetchCliReleaseAvailability()).resolves.toBeNull();
  });

  it('advertises nothing when the signed manifest is not publicly retrievable', async () => {
    vi.mocked(fetchLatestDesktopRelease).mockResolvedValue(release('6.0.0') as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) =>
        String(url).endsWith('/SHA256SUMS.sig')
          ? new Response(null, { status: 404 })
          : new Response(null, { status: 200 }),
      ),
    );
    await expect(fetchCliReleaseAvailability()).resolves.toBeNull();
  });

  it('advertises a release whose archives and signed manifest are all public', async () => {
    vi.mocked(fetchLatestDesktopRelease).mockResolvedValue(release('7.0.0') as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const availability = await fetchCliReleaseAvailability();
    expect(availability?.version).toBe('7.0.0');
    expect(availability?.downloads.map((d) => d.platform)).toEqual(['darwin-arm64', 'linux-x64']);
  });

  it('treats a network failure as unavailable rather than advertising a guess', async () => {
    vi.mocked(fetchLatestDesktopRelease).mockResolvedValue(release('4.0.0') as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(fetchCliReleaseAvailability()).resolves.toBeNull();
  });
});
