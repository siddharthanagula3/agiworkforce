import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { fetchMock, loggerErrorMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.stubGlobal('fetch', fetchMock);
vi.mock('@shared/lib/logger', () => ({
  logger: { error: loggerErrorMock },
}));
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: null, isLoaded: true }),
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock('@/features/marketing/components/Reveal', () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => children,
}));

import { WEB_ENTRY_HREF } from '@/features/marketing/components/system/nav';
import { DesktopDownloadAvailability } from '../DesktopDownloadAvailability';
import DesktopPage from '../../desktop/page';
import DownloadLoading from '../loading';
import DownloadError from '../error';

const DESKTOP_RELEASE_PATH = '/api/releases/desktop-cloud/latest';
const CHECKSUM_PATH = '/api/download/checksums';
const ARM64_SHA = 'a'.repeat(64);
const X64_SHA = 'b'.repeat(64);

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

function releaseNotFound() {
  return Response.json(
    { error: { code: 'NOT_FOUND', message: 'No release found' } },
    { status: 404 },
  );
}

function requestPath(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input.toString();
}

function respondWith(
  manifest: ReturnType<typeof desktopManifest> | null,
  checksums: ReturnType<typeof checksumManifest> | null,
) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    if (requestPath(input).includes(CHECKSUM_PATH)) {
      return Promise.resolve(checksums === null ? releaseNotFound() : Response.json(checksums));
    }
    return Promise.resolve(manifest === null ? releaseNotFound() : Response.json(manifest));
  });
}

beforeEach(() => {
  respondWith(desktopManifest(), checksumManifest());
});

describe('the Desktop installer section on /desktop', () => {
  it('asks the desktop release API once and offers one signed installer per architecture', async () => {
    render(<DesktopDownloadAvailability />);

    const region = await screen.findByRole('region', { name: 'Desktop installer availability' });
    expect(
      await within(region).findByRole('link', { name: 'Download for Apple silicon' }),
    ).toHaveAttribute('href', '/api/download?platform=mac&arch=arm64');
    expect(within(region).getByRole('link', { name: 'Download for Intel Mac' })).toHaveAttribute(
      'href',
      '/api/download?platform=mac&arch=x64',
    );
    expect(within(region).queryByRole('link', { name: /Linux|Windows/i })).not.toBeInTheDocument();
    const desktopRequests = fetchMock.mock.calls
      .map(([input]) => requestPath(input as RequestInfo))
      .filter((url) => url.includes('/api/releases/desktop'));
    expect(desktopRequests).toEqual([DESKTOP_RELEASE_PATH]);
  });

  it('offers only the architecture the release actually carries', async () => {
    respondWith(desktopManifest({ arm64: true, x64: false }), checksumManifest());
    render(<DesktopDownloadAvailability />);

    expect(
      await screen.findByRole('link', { name: 'Download for Apple silicon' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download for Intel Mac' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(ARM64_SHA)).toBeInTheDocument();
    });
    expect(screen.queryByText(X64_SHA)).not.toBeInTheDocument();
  });

  it('names Windows and Linux as unavailable rather than leaving them out', async () => {
    render(<DesktopDownloadAvailability />);

    const region = await screen.findByRole('region', { name: 'Desktop installer availability' });
    for (const platform of ['Windows', 'Linux']) {
      const row = within(region).getByRole('status', { name: `${platform} downloads unavailable` });
      expect(row).toHaveTextContent(`${platform} installer not published.`);
      expect(row).toHaveTextContent('No release date is available for it.');
      expect(row).toHaveAttribute('aria-live', 'polite');
    }
  });

  it('publishes a checksum per offered installer and numbered install steps', async () => {
    render(<DesktopDownloadAvailability />);

    const checksums = await screen.findByRole('list', { name: 'Installer checksums' });
    expect(within(checksums).getByText(ARM64_SHA)).toBeInTheDocument();
    expect(within(checksums).getByText(X64_SHA)).toBeInTheDocument();

    const steps = screen.getByRole('list', { name: 'Install AGI Desktop on macOS' });
    expect(steps.tagName).toBe('OL');
    expect(within(steps).getAllByRole('listitem').length).toBeGreaterThanOrEqual(4);
    expect(steps).toHaveTextContent('shasum -a 256');
    expect(steps).toHaveTextContent('Applications');
  });

  it('shows no checksum block when the release publishes none', async () => {
    respondWith(desktopManifest(), null);
    render(<DesktopDownloadAvailability />);

    expect(
      await screen.findByRole('link', { name: 'Download for Apple silicon' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Installer checksums' })).not.toBeInTheDocument();
  });

  it('offers both installers and says so when the browser cannot name the processor', async () => {
    render(<DesktopDownloadAvailability />);

    expect(
      await screen.findByRole('link', { name: 'Download for Apple silicon' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download for Intel Mac' })).toBeInTheDocument();
    expect(screen.getByText(/could not read this machine/i)).toBeInTheDocument();
  });

  it('shows an accessible empty state when no signed desktop release exists', async () => {
    respondWith(null, null);
    render(<DesktopDownloadAvailability />);

    const status = await screen.findByRole('status', { name: 'AGI Desktop downloads unavailable' });
    expect(status).toHaveTextContent('No signed AGI Desktop installer is available right now.');
    expect(
      screen.getByRole('region', { name: 'Desktop installer availability' }),
    ).not.toHaveTextContent('AGI Desktop ships for macOS');
    expect(within(status).getByRole('link', { name: 'Use AGI Chat' })).toHaveAttribute(
      'href',
      WEB_ENTRY_HREF,
    );
    expect(within(status).getByRole('link', { name: 'See CLI availability' })).toHaveAttribute(
      'href',
      '/cli',
    );
    expect(screen.queryByRole('link', { name: /Download for/i })).not.toBeInTheDocument();
  });

  it('shows an accessible error with a working retry action', async () => {
    let releaseRequests = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (requestPath(input).includes(CHECKSUM_PATH)) {
        return Promise.resolve(Response.json(checksumManifest()));
      }
      releaseRequests += 1;
      return releaseRequests === 1
        ? Promise.reject(new Error('network unavailable'))
        : Promise.resolve(Response.json(desktopManifest()));
    });
    render(<DesktopDownloadAvailability />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not verify the AGI Desktop installer.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry release check' }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Download for Apple silicon' })).toBeInTheDocument();
    });
  });

  it('announces the live availability check and uses theme-token colors', () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    render(<DesktopDownloadAvailability />);

    const status = screen.getByRole('status', { name: 'Checking AGI Desktop downloads' });
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status.closest('.agi-ds-ledger')).not.toBeNull();
    expect(status).not.toHaveClass('bg-black', 'text-white');
  });

  it('uses the same verified availability component on the Desktop product page', async () => {
    render(<DesktopPage />);

    expect(await screen.findByRole('link', { name: 'Download for Apple silicon' })).toHaveAttribute(
      'href',
      '/api/download?platform=mac&arch=arm64',
    );
    expect(screen.queryByText(/AppImage|Tauri|Linux x64/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Public launch ·/i)).not.toBeInTheDocument();
  });

  it('renders the route loading state as an announced theme-aware status', () => {
    render(<DownloadLoading />);

    const status = screen.getByRole('status', { name: 'Loading download options' });
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status.parentElement).toHaveClass('bg-background', 'text-foreground');
    expect(status.parentElement).not.toHaveClass('bg-black');
  });

  it('renders the route error boundary with retry, Web, and CLI recovery paths', () => {
    const reset = vi.fn();
    render(<DownloadError error={new Error('route failed')} reset={reset} />);

    expect(screen.getByRole('heading', { name: 'Unable to load downloads' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Use AGI Chat' })).toHaveAttribute(
      'href',
      WEB_ENTRY_HREF,
    );
    expect(screen.getByRole('link', { name: 'See CLI availability' })).toHaveAttribute(
      'href',
      '/cli',
    );
  });
});
