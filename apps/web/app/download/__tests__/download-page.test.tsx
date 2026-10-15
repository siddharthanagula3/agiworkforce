import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DetectedArchitecture } from '../detect-architecture';

const { fetchMock, detectMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  detectMock: vi.fn<() => Promise<DetectedArchitecture>>(),
}));

vi.stubGlobal('fetch', fetchMock);
vi.mock('@shared/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { error: vi.fn() },
}));
vi.mock('@clerk/nextjs', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUser: () => ({ user: null, isLoaded: true }),
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock('../detect-architecture', async (importOriginal) => ({
  ...(await importOriginal<DetectArchitectureModule>()),
  detectMacArchitecture: detectMock,
}));

import {
  AVAILABLE_NOW_LABEL,
  COMING_SOON_LABEL,
  NOTIFY_CTA,
  SURFACE_IDS,
  SURFACE_STATUS,
  surfaceCta,
} from '@/lib/surface-status';
import { WEB_ENTRY_HREF } from '@/features/marketing/components/system/nav';
import DownloadPage from '../page';

type DetectArchitectureModule = typeof import('../detect-architecture');

const SOURCES = ['page.tsx', 'DownloadSurfaces.tsx'].map((file) =>
  readFileSync(join(__dirname, '..', file), 'utf8'),
);

const DESKTOP_RELEASE_PATH = '/api/releases/desktop-cloud/latest';
const CLI_RELEASE_PATH = '/api/releases/cli/latest';
const CHECKSUM_PATH = '/api/download/checksums';
const ARM64_SHA = 'a'.repeat(64);
const X64_SHA = 'b'.repeat(64);
const CLI_BASE_URL =
  'https://github.com/siddharthanagula3/agiworkforce/releases/download/v-cli-1.0.0';

type Handler = (path: string) => Response | Promise<Response>;

function notFound() {
  return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
}

function desktopManifest(architectures = { arm64: true, x64: true }) {
  return {
    version: '1.2.0',
    publishedAt: '2026-08-13T00:00:00.000Z',
    platforms: { mac: true },
    architectures,
  };
}

function checksumManifest() {
  return {
    version: '1.2.0',
    algorithm: 'sha256',
    installers: [
      { name: 'agiworkforce_1.2.0_aarch64.dmg', architecture: 'arm64', sha256: ARM64_SHA },
      { name: 'agiworkforce_1.2.0_x64.dmg', architecture: 'x64', sha256: X64_SHA },
    ],
  };
}

function cliAvailability(downloadUrl = `${CLI_BASE_URL}/agiworkforce-darwin-arm64.tar.gz`) {
  return {
    version: '1.0.0',
    publishedAt: '2026-05-04T17:00:55Z',
    downloads: [
      {
        platform: 'darwin-arm64',
        assetName: 'agiworkforce-darwin-arm64.tar.gz',
        downloadUrl,
        sizeBytes: 2048,
      },
    ],
  };
}

function serve(routes: Partial<Record<string, Handler>>) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const path = typeof input === 'string' ? input : input.toString();
    const route = Object.keys(routes).find((prefix) => path.startsWith(prefix));
    return Promise.resolve(route ? routes[route]!(path) : notFound());
  });
}

function macRelease(architectures = { arm64: true, x64: true }) {
  serve({
    [DESKTOP_RELEASE_PATH]: () => Response.json(desktopManifest(architectures)),
    [CHECKSUM_PATH]: () => Response.json(checksumManifest()),
  });
}

function surfaceList() {
  return screen.getByRole('list', { name: 'Every way to use AGI' });
}

function row(surface: string): HTMLElement {
  const element = surfaceList().querySelector<HTMLElement>(`[data-surface="${surface}"]`);
  expect(element, surface).not.toBeNull();
  return element!;
}

beforeEach(() => {
  detectMock.mockResolvedValue('unknown');
  serve({});
});

describe('/download with no published desktop build', () => {
  it('leads with AGI Web under one visible heading', async () => {
    render(<DownloadPage />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Use AGI today, in your browser');
    expect(heading).not.toHaveClass('sr-only');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const hero = heading.closest('section')!;
    expect(within(hero).getByRole('link', { name: 'Open AGI Web' })).toHaveAttribute(
      'href',
      WEB_ENTRY_HREF,
    );
    expect(within(hero).getByRole('link', { name: 'Get notified about the apps' })).toHaveAttribute(
      'href',
      '#notify',
    );
    expect(hero).toHaveTextContent('Works in current Chrome, Edge, Firefox and Safari.');

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(DESKTOP_RELEASE_PATH, expect.anything()),
    );
    expect(screen.queryByRole('link', { name: /Download for Mac/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Verify your download')).not.toBeInTheDocument();
  });

  it('lists every surface once, with the status the registry holds', () => {
    render(<DownloadPage />);

    const rows = within(surfaceList()).getAllByRole('listitem');
    expect(rows.map((item) => item.dataset['surface'])).toEqual([...SURFACE_IDS]);
    for (const surface of SURFACE_IDS) {
      expect(row(surface)).toHaveTextContent(SURFACE_STATUS[surface]);
    }
  });

  it('sends the notify-list surfaces to the form and keeps the download anchors on their rows', () => {
    render(<DownloadPage />);

    const notify = within(surfaceList()).getAllByRole('link', { name: /^Get notified about / });
    expect(notify.length).toBe(
      SURFACE_IDS.filter((surface) => surface !== 'web' && surfaceCta(surface) === NOTIFY_CTA)
        .length,
    );
    for (const link of notify) expect(link).toHaveAttribute('href', '#notify');

    const form = document.getElementById('notify')!;
    expect(within(form).getByRole('heading', { name: 'Hear when an app is ready' })).toBeVisible();
    expect(within(form).getByLabelText('Email address')).toBeInTheDocument();

    for (const surface of ['desktop', 'cli'] as const) {
      const anchor = surfaceCta(surface).href.split('#')[1]!;
      expect(document.getElementById(anchor)).toBe(row(surface));
    }
  });

  it('types no status label by hand and carries none of the removed sections', () => {
    for (const source of SOURCES) {
      expect(source).not.toContain(AVAILABLE_NOW_LABEL);
      expect(source).not.toContain(COMING_SOON_LABEL);
      expect(source).not.toContain('Transcript');
      expect(source).not.toContain('cosign');
    }
  });

  it('names a failed release check and retries it into the Mac hero', async () => {
    let releaseRequests = 0;
    serve({
      [DESKTOP_RELEASE_PATH]: () => {
        releaseRequests += 1;
        return releaseRequests === 1
          ? Promise.reject(new Error('network unavailable'))
          : Response.json(desktopManifest());
      },
    });
    render(<DownloadPage />);

    const desktop = row('desktop');
    expect(await within(desktop).findByRole('alert')).toHaveTextContent(
      'We could not check for a Desktop release.',
    );
    fireEvent.click(within(desktop).getByRole('button', { name: 'Retry release check' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'AGI for Mac' })).toBeVisible();
  });
});

describe('/download with a published macOS build', () => {
  it('offers the Apple silicon installer first on an Apple silicon Mac', async () => {
    detectMock.mockResolvedValue('arm64');
    macRelease();
    render(<DownloadPage />);

    const heading = await screen.findByRole('heading', { level: 1, name: 'AGI for Mac' });
    const hero = heading.closest('section')!;
    await waitFor(() => expect(hero).toHaveTextContent('Detected: Apple silicon.'));
    expect(within(hero).getByRole('link', { name: 'Download for Mac' })).toHaveAttribute(
      'href',
      '/api/download?platform=mac&arch=arm64',
    );
    expect(
      within(hero).getByRole('link', { name: 'Download the Intel Mac version' }),
    ).toHaveAttribute('href', '/api/download?platform=mac&arch=x64');
    expect(within(hero).getByRole('link', { name: 'Open AGI Web' })).toHaveAttribute(
      'href',
      WEB_ENTRY_HREF,
    );
    expect(hero).toHaveTextContent('version 1.2.0');

    const desktop = row('desktop');
    expect(desktop).toHaveTextContent(AVAILABLE_NOW_LABEL);
    expect(within(desktop).getByRole('link', { name: 'Download for Mac' })).toHaveAttribute(
      'href',
      '/api/download?platform=mac&arch=arm64',
    );
  });

  it('offers the Intel installer first on an Intel Mac', async () => {
    detectMock.mockResolvedValue('x64');
    macRelease();
    render(<DownloadPage />);

    const hero = (await screen.findByRole('heading', { level: 1, name: 'AGI for Mac' })).closest(
      'section',
    )!;
    await waitFor(() =>
      expect(within(hero).getByRole('link', { name: 'Download for Mac' })).toHaveAttribute(
        'href',
        '/api/download?platform=mac&arch=x64',
      ),
    );
    expect(hero).toHaveTextContent('Detected: Intel Mac.');
    expect(
      within(hero).getByRole('link', { name: 'Download the Apple silicon version' }),
    ).toHaveAttribute('href', '/api/download?platform=mac&arch=arm64');
  });

  it('says so when the release carries only the other architecture', async () => {
    detectMock.mockResolvedValue('x64');
    macRelease({ arm64: true, x64: false });
    render(<DownloadPage />);

    const hero = (await screen.findByRole('heading', { level: 1, name: 'AGI for Mac' })).closest(
      'section',
    )!;
    await waitFor(() =>
      expect(hero).toHaveTextContent('This release is published for Apple silicon only.'),
    );
    expect(within(hero).getByRole('link', { name: 'Download for Mac' })).toHaveAttribute(
      'href',
      '/api/download?platform=mac&arch=arm64',
    );
    expect(within(hero).queryByRole('link', { name: /version$/ })).not.toBeInTheDocument();
  });

  it('names the guess when the browser cannot read the processor', async () => {
    macRelease();
    render(<DownloadPage />);

    const hero = (await screen.findByRole('heading', { level: 1, name: 'AGI for Mac' })).closest(
      'section',
    )!;
    expect(hero).toHaveTextContent('This is the Apple silicon version.');
    expect(hero).toHaveTextContent('About This Mac');
    expect(
      within(hero).getByRole('link', { name: 'Download the Intel Mac version' }),
    ).toBeVisible();
  });

  it('keeps checksums and signature checks in a closed section at the end', async () => {
    detectMock.mockResolvedValue('arm64');
    macRelease({ arm64: true, x64: false });
    render(<DownloadPage />);

    const summary = await screen.findByText('Verify your download');
    const details = summary.closest('details')!;
    expect(details).not.toHaveAttribute('open');
    const checksums = await within(details).findByRole('list', { name: 'Installer checksums' });
    expect(checksums).toHaveTextContent(ARM64_SHA);
    expect(checksums).not.toHaveTextContent(X64_SHA);
    expect(details).toHaveTextContent('codesign -dv --verbose=4 "/Applications/AGI Cloud.app"');
    expect(details).toHaveTextContent(
      'xcrun stapler validate ~/Downloads/agiworkforce_1.2.0_aarch64.dmg',
    );
    expect(
      document.getElementById('notify')!.compareDocumentPosition(details) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('the CLI row on /download', () => {
  it('links every archive the release probe verifies', async () => {
    serve({ [CLI_RELEASE_PATH]: () => Response.json(cliAvailability()) });
    render(<DownloadPage />);

    const cli = row('cli');
    const archives = await within(cli).findByRole('list', { name: 'CLI archives' });
    expect(
      within(archives).getByRole('link', { name: 'Download agiworkforce-darwin-arm64.tar.gz' }),
    ).toHaveAttribute('href', `${CLI_BASE_URL}/agiworkforce-darwin-arm64.tar.gz`);
    expect(cli).toHaveTextContent(AVAILABLE_NOW_LABEL);
  });

  it('refuses an archive URL served from outside the GitHub release boundary', async () => {
    serve({
      [CLI_RELEASE_PATH]: () =>
        Response.json(cliAvailability('https://cdn.example.test/agiworkforce-darwin-arm64.tar.gz')),
    });
    render(<DownloadPage />);

    const cli = row('cli');
    expect(await within(cli).findByRole('alert')).toHaveTextContent(
      'We could not verify the CLI archives.',
    );
    expect(within(cli).queryByRole('link', { name: /^Download / })).not.toBeInTheDocument();
    expect(cli).toHaveTextContent(SURFACE_STATUS.cli);
  });
});
