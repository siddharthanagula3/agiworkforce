import { describe, expect, it, vi } from 'vitest';
import {
  DESKTOP_CLOUD_RELEASE_AVAILABILITY_URL,
  checkDesktopCloudUpdate,
  compareDesktopCloudVersions,
  desktopCloudInstallerDownloadUrl,
} from '../desktopCloudUpdate';

function releaseResponse(version: string, status = 200): Response {
  return Response.json(
    {
      version,
      publishedAt: '2026-08-13T00:00:00.000Z',
      platforms: { mac: true },
      architectures: { arm64: true, x64: true },
    },
    { status },
  );
}

describe('desktop cloud update contract', () => {
  it('uses the published availability and signed-installer routes', async () => {
    const fetchMock = vi.fn(async () => releaseResponse('1.3.0'));

    await expect(
      checkDesktopCloudUpdate('1.2.0', 'x64', fetchMock as typeof fetch),
    ).resolves.toEqual({
      available: true,
      currentVersion: '1.2.0',
      version: '1.3.0',
      publishedAt: '2026-08-13T00:00:00.000Z',
      downloadUrl: desktopCloudInstallerDownloadUrl('x64'),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      DESKTOP_CLOUD_RELEASE_AVAILABILITY_URL,
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
  });

  it('does not advertise an equal or older published version', async () => {
    const same = vi.fn(async () => releaseResponse('1.2.0'));
    const older = vi.fn(async () => releaseResponse('1.1.9'));

    await expect(
      checkDesktopCloudUpdate('1.2.0', 'arm64', same as typeof fetch),
    ).resolves.toMatchObject({
      available: false,
    });
    await expect(
      checkDesktopCloudUpdate('1.2.0', 'arm64', older as typeof fetch),
    ).resolves.toMatchObject({
      available: false,
    });
  });

  it('handles SemVer prerelease precedence and rejects malformed versions', () => {
    expect(compareDesktopCloudVersions('2.0.0', '2.0.0-beta.9')).toBeGreaterThan(0);
    expect(compareDesktopCloudVersions('2.0.0-beta.10', '2.0.0-beta.2')).toBeGreaterThan(0);
    expect(() => compareDesktopCloudVersions('latest', '1.0.0')).toThrow(
      /invalid release version/i,
    );
  });

  /**
   * Observed 2026-09-08: launching the built app logged an unhandled
   * 'agi:check-update' error every time, because the endpoint 404s until a
   * release is tagged on GitHub with a signed .dmg, and the client threw on
   * any non-OK status.
   *
   * The distinction this keeps: a 404 is a real answer, "nothing is
   * published". A 503 is the check itself failing, and must still throw
   * rather than quietly reporting the user is up to date.
   */
  it('reports no update, without throwing, before any release is published', async () => {
    const notPublished = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 'NOT_FOUND' } }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const result = await checkDesktopCloudUpdate('1.2.0', 'arm64', notPublished as typeof fetch);

    expect(result.available).toBe(false);
    expect(result.currentVersion).toBe('1.2.0');
  });

  it('tells the feed which build is asking, so a hold on one version reaches it', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => releaseResponse('1.3.0'));

    await checkDesktopCloudUpdate('1.2.0', 'arm64', fetchMock as unknown as typeof fetch);

    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('x-agi-client-version')).toBe('1.2.0');
  });

  it('reports a held update as unavailable rather than as the app being up to date', async () => {
    const held = vi.fn(async () =>
      Response.json({ error: { code: 'UPDATES_HELD' } }, { status: 503 }),
    );

    await expect(checkDesktopCloudUpdate('1.2.0', 'arm64', held as typeof fetch)).rejects.toThrow(
      /unavailable \(503\)/i,
    );
  });

  it('treats an unavailable or malformed release response as an error, not up to date', async () => {
    const unavailable = vi.fn(async () => new Response(null, { status: 503 }));
    const malformed = vi.fn(async () => Response.json({ version: '1.3.0' }));

    await expect(
      checkDesktopCloudUpdate('1.2.0', 'arm64', unavailable as typeof fetch),
    ).rejects.toThrow(/unavailable \(503\)/i);
    await expect(
      checkDesktopCloudUpdate('1.2.0', 'arm64', malformed as typeof fetch),
    ).rejects.toThrow(/incomplete release metadata/i);
  });

  /**
   * The update feed is the one thing in this app that talks to a server before
   * the user has asked for anything. A feed that is down, slow or unreachable
   * is a failed update check and nothing else: it says so in words a user can
   * act on, it does not claim the app is current, and it leaves no promise of
   * a download behind for the rest of the app to act on.
   */
  it('reports the outage rather than the app being up to date when the feed is unreachable', async () => {
    const outages: [string, () => Promise<Response>, RegExp][] = [
      [
        'the network never answered',
        () => Promise.reject(new TypeError('fetch failed')),
        /could not reach the update service/,
      ],
      [
        'the request timed out',
        () => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')),
        /could not reach the update service in time/,
      ],
      [
        'the server is down',
        async () => new Response(null, { status: 502 }),
        /unavailable \(502\)/,
      ],
      [
        'a proxy answered with a page',
        async () => new Response('<html>offline</html>', { status: 200 }),
        /invalid release response|incomplete release metadata/i,
      ],
    ];

    for (const [name, fetchImpl, expected] of outages) {
      await expect(
        checkDesktopCloudUpdate('1.2.0', 'arm64', fetchImpl as unknown as typeof fetch),
        name,
      ).rejects.toThrow(expected);
    }
  });

  it('never offers an installer for the wrong Mac architecture', async () => {
    const armOnly = vi.fn(async () =>
      Response.json({
        version: '1.3.0',
        platforms: { mac: true },
        architectures: { arm64: true, x64: false },
      }),
    );

    await expect(checkDesktopCloudUpdate('1.2.0', 'x64', armOnly as typeof fetch)).rejects.toThrow(
      /no signed AGI Cloud x64 installer/i,
    );
  });
});
