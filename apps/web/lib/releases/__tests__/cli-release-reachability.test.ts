import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../github-desktop-releases', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../github-desktop-releases')>();
  return { ...actual, fetchLatestDesktopRelease: vi.fn() };
});

import { fetchLatestDesktopRelease } from '../github-desktop-releases';
import { fetchCliReleaseAvailability } from '../github-cli-releases';

// Reachability is cached per URL for the life of the process, which is what we
// want in production but would let one case answer for the next. Each case gets
// its own release version, so its asset URLs are its own.
function release(version: string) {
  const base = `https://github.com/siddharthanagula3/agiworkforce/releases/download/v-cli-${version}`;
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
        String(url).includes('linux-x64')
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
