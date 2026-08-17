import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.stubGlobal('fetch', fetchMock);
vi.mock('@shared/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: null, isLoaded: true }),
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock('@/features/marketing/components/Reveal', () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => children,
}));

import DownloadPage from '../page';

const CLI_BASE_URL =
  'https://github.com/siddharthanagula3/agiworkforce/releases/download/v-cli-1.0.0';

function cliAvailability() {
  return {
    version: '1.0.0',
    publishedAt: '2026-05-04T17:00:55Z',
    downloads: [
      {
        platform: 'darwin-arm64',
        assetName: 'agiworkforce-darwin-arm64.tar.gz',
        downloadUrl: `${CLI_BASE_URL}/agiworkforce-darwin-arm64.tar.gz`,
        sizeBytes: 2048,
      },
      {
        platform: 'linux-x64',
        assetName: 'agiworkforce-linux-x64.tar.gz',
        downloadUrl: `${CLI_BASE_URL}/agiworkforce-linux-x64.tar.gz`,
        sizeBytes: 2048,
      },
    ],
  };
}

function notFound() {
  return Response.json(
    { error: { code: 'NOT_FOUND', message: 'No CLI release archive is published' } },
    { status: 404 },
  );
}

function respondTo(handler: (url: string) => Response): void {
  fetchMock.mockImplementation((input: RequestInfo | URL) =>
    Promise.resolve(handler(typeof input === 'string' ? input : input.toString())),
  );
}

beforeEach(() => {
  respondTo((url) =>
    url.includes('/api/releases/cli/latest') ? Response.json(cliAvailability()) : notFound(),
  );
});

describe('CLI download availability on /download', () => {
  it('offers a real archive link for every platform the release probe verifies', async () => {
    render(<DownloadPage />);

    const region = await screen.findByRole('region', { name: 'CLI archive availability' });
    expect(
      within(region).getByRole('link', { name: 'Download agiworkforce-darwin-arm64.tar.gz' }),
    ).toHaveAttribute('href', `${CLI_BASE_URL}/agiworkforce-darwin-arm64.tar.gz`);
    expect(
      within(region).getByRole('link', { name: 'Download agiworkforce-linux-x64.tar.gz' }),
    ).toHaveAttribute('href', `${CLI_BASE_URL}/agiworkforce-linux-x64.tar.gz`);
  });

  it('offers no download control when the CLI release publishes no archive', async () => {
    respondTo(() => notFound());

    render(<DownloadPage />);

    const status = await screen.findByRole('status', { name: 'CLI downloads unavailable' });
    expect(
      within(status).getByText('No published CLI archive is available right now.'),
    ).toBeInTheDocument();
    expect(within(status).queryByRole('link', { name: /^Download / })).not.toBeInTheDocument();
  });

  it('refuses an archive URL served from outside the GitHub release boundary', async () => {
    respondTo((url) =>
      url.includes('/api/releases/cli/latest')
        ? Response.json({
            version: '1.0.0',
            publishedAt: '2026-05-04T17:00:55Z',
            downloads: [
              {
                platform: 'linux-x64',
                assetName: 'agiworkforce-linux-x64.tar.gz',
                downloadUrl: 'https://cdn.example.test/agiworkforce-linux-x64.tar.gz',
                sizeBytes: 2048,
              },
            ],
          })
        : notFound(),
    );

    render(<DownloadPage />);

    expect(
      await screen.findByRole('status', { name: 'CLI download check failed' }),
    ).toHaveTextContent('We could not verify the CLI archives.');
    expect(
      screen.queryByRole('link', { name: 'Download agiworkforce-linux-x64.tar.gz' }),
    ).not.toBeInTheDocument();
  });
});
