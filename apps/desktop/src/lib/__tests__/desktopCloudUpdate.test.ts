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
