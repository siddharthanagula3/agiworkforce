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

import DownloadPage from '../page';
import DesktopPage from '../../desktop/page';
import DownloadLoading from '../loading';
import DownloadError from '../error';

function signedLinuxManifest() {
  return {
    version: '1.10.0',
    notes: 'Stable Linux release',
    pub_date: '2026-07-15T00:00:00Z',
    platforms: {
      'linux-x86_64': {
        url: 'https://github.com/siddharthanagula3/agiworkforce/releases/download/v-desktop-1.10.0/AGI.Workforce_1.10.0_amd64.AppImage',
        signature: 'tauri-signature',
      },
    },
  };
}

function cloudDesktopManifest() {
  return {
    version: '1.2.0',
    publishedAt: '2026-08-13T00:00:00.000Z',
    platforms: { mac: true },
    architectures: { arm64: true, x64: true },
  };
}

beforeEach(() => {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    return Promise.resolve(
      Response.json(url.includes('desktop-cloud') ? cloudDesktopManifest() : signedLinuxManifest()),
    );
  });
});

describe('public Desktop download surfaces', () => {
  it('exposes the two-line hero as one correctly spaced heading', () => {
    render(<DownloadPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'AGI on every surface.' })).toBeVisible();
  });

  it('offers only the verified Linux AppImage from the shared download API', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('desktop-cloud')) {
        return Promise.resolve(
          Response.json(
            { error: { code: 'NOT_FOUND', message: 'No release found' } },
            { status: 404 },
          ),
        );
      }
      return Promise.resolve(Response.json(signedLinuxManifest()));
    });

    render(<DownloadPage />);

    const region = await screen.findByRole('region', { name: 'Desktop installer availability' });
    expect(
      within(region).getByRole('link', { name: 'Download Linux x64 AppImage' }),
    ).toHaveAttribute('href', '/api/download?platform=linux');
    expect(
      within(region).getByText('No signed macOS installer is available right now.'),
    ).toBeInTheDocument();
    expect(within(region).getByText('Windows installer not published')).toBeInTheDocument();
    expect(within(region).queryByRole('link', { name: /macOS|Windows/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/July 12, 2026|July 12/i)).not.toBeInTheDocument();
  });

  it('offers architecture-specific signed AGI Cloud installers', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('desktop-cloud')) {
        return Promise.resolve(Response.json(cloudDesktopManifest()));
      }
      return Promise.resolve(Response.json(signedLinuxManifest()));
    });

    render(<DownloadPage />);

    expect(await screen.findByRole('link', { name: 'Download for Apple silicon' })).toHaveAttribute(
      'href',
      '/api/download?platform=mac&app=cloud&arch=arm64',
    );
    expect(screen.getByRole('link', { name: 'Download for Intel Mac' })).toHaveAttribute(
      'href',
      '/api/download?platform=mac&app=cloud&arch=x64',
    );
  });

  it('shows an accessible empty state when no signed Linux release exists', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: { code: 'NOT_FOUND', message: 'No release found' } }, { status: 404 }),
    );
    render(<DownloadPage />);

    const status = await screen.findByRole('status', { name: 'Desktop downloads unavailable' });
    expect(status).toHaveTextContent('No signed Linux installer is available right now.');
    expect(within(status).getByRole('link', { name: 'Use AGI Web' })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2F',
    );
    expect(within(status).getByRole('link', { name: 'See CLI availability' })).toHaveAttribute(
      'href',
      '/cli',
    );
  });

  it('shows an accessible error with a working retry action', async () => {
    let linuxRequests = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('desktop-cloud')) {
        return Promise.resolve(Response.json(cloudDesktopManifest()));
      }
      linuxRequests += 1;
      return linuxRequests === 1
        ? Promise.reject(new Error('network unavailable'))
        : Promise.resolve(Response.json(signedLinuxManifest()));
    });
    render(<DownloadPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not verify the Linux installer.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry release check' }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Download Linux x64 AppImage' })).toBeInTheDocument();
    });
  });

  it('announces the live availability check and uses theme-token colors', () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    render(<DownloadPage />);

    const status = screen.getByRole('status', { name: 'Checking Desktop downloads' });
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveClass('bg-card', 'text-card-foreground', 'border-border');
    expect(status).not.toHaveClass('bg-black', 'text-white');
  });

  it('uses the same verified availability component on the Desktop product page', async () => {
    render(<DesktopPage />);

    expect(
      await screen.findByRole('link', { name: 'Download Linux x64 AppImage' }),
    ).toHaveAttribute('href', '/api/download?platform=linux');
    expect(screen.queryByText('macOS universal · Windows x64 · Linux x64')).not.toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'Use AGI Web' })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2F',
    );
    expect(screen.getByRole('link', { name: 'See CLI availability' })).toHaveAttribute(
      'href',
      '/cli',
    );
  });
});
