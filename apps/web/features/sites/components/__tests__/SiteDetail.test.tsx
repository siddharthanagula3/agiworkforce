import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedSite, SiteData } from '../../services/sites-service';
type SitesServiceModule = typeof import('../../services/sites-service');

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  listPublishedSites: vi.fn(),
  unpublishArtifact: vi.fn(),
  updatePublishedSite: vi.fn(),
  readPublishedSiteVersion: vi.fn(),
  listPublishedArtifactVersions: vi.fn(),
  republishArtifactVersion: vi.fn(),
  readPublishedSiteData: vi.fn(),
  clearPublishedSiteSharedData: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock('../../services/sites-service', async (importOriginal) => ({
  ...(await importOriginal<SitesServiceModule>()),
  listPublishedSites: (...args: unknown[]) => mocks.listPublishedSites(...args),
  unpublishArtifact: (...args: unknown[]) => mocks.unpublishArtifact(...args),
  updatePublishedSite: (...args: unknown[]) => mocks.updatePublishedSite(...args),
  readPublishedSiteVersion: (...args: unknown[]) => mocks.readPublishedSiteVersion(...args),
  listPublishedArtifactVersions: (...args: unknown[]) =>
    mocks.listPublishedArtifactVersions(...args),
  republishArtifactVersion: (...args: unknown[]) => mocks.republishArtifactVersion(...args),
  readPublishedSiteData: (...args: unknown[]) => mocks.readPublishedSiteData(...args),
  clearPublishedSiteSharedData: (...args: unknown[]) => mocks.clearPublishedSiteSharedData(...args),
}));

const { SiteDetail } = await import('../SiteDetail');

const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function site(overrides: Partial<PublishedSite> = {}): PublishedSite {
  return {
    token: TOKEN,
    artifactId: 'artifact-1',
    conversationId: '11111111-1111-4111-8111-111111111111',
    title: 'Team scoreboard',
    kind: 'react',
    language: null,
    contentChars: 120,
    version: 2,
    visibility: 'public',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-09T00:00:00.000Z',
    shareUrl: `https://agiworkforce.com/shared-artifact/${TOKEN}`,
    sandboxed: true,
    ...overrides,
  };
}

function data(overrides: Partial<SiteData> = {}): SiteData {
  return {
    supported: true,
    shared: {
      entries: [
        {
          key: 'scores',
          bytes: 2048,
          preview: '{"ana":3}',
          truncated: false,
          updatedAt: '2026-10-09T00:00:00.000Z',
        },
      ],
      entryCount: 1,
      totalBytes: 2048,
      limitBytes: 20 * 1024 * 1024,
    },
    ownPersonalEntryCount: 2,
    ...overrides,
  };
}

async function openDataTab() {
  const tab = await screen.findByRole('tab', { name: 'Data' });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  fireEvent.keyDown(tab, { key: 'Enter' });
  fireEvent.click(tab);
}

beforeEach(() => {
  mocks.listPublishedSites.mockResolvedValue({ sites: [site()], workspace: null });
  mocks.readPublishedSiteVersion.mockResolvedValue({
    version: 2,
    title: 'Team scoreboard',
    kind: 'react',
    language: null,
    content: 'export default () => null',
  });
  mocks.listPublishedArtifactVersions.mockResolvedValue([
    {
      version: 2,
      title: 'Team scoreboard',
      kind: 'react',
      createdAt: site().updatedAt,
      live: true,
    },
    {
      version: 1,
      title: 'Team scoreboard',
      kind: 'react',
      createdAt: site().createdAt,
      live: false,
    },
  ]);
  mocks.republishArtifactVersion.mockResolvedValue(undefined);
  mocks.unpublishArtifact.mockResolvedValue(undefined);
  mocks.readPublishedSiteData.mockResolvedValue(data());
  mocks.clearPublishedSiteSharedData.mockResolvedValue(1);
});

describe('SiteDetail', () => {
  it('shows the header with the link, visit and edit routes, and opens on Settings', async () => {
    render(<SiteDetail token={TOKEN} />);

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Team scoreboard');
    expect(screen.getByRole('link', { name: /visit/i })).toHaveAttribute(
      'href',
      `/shared-artifact/${TOKEN}`,
    );
    expect(screen.getByRole('link', { name: /edit in chat/i })).toHaveAttribute(
      'href',
      '/chat/11111111-1111-4111-8111-111111111111?artifact=artifact-1',
    );
    expect(screen.getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Site URL')).toHaveValue(site().shareUrl);
    expect(mocks.readPublishedSiteData).not.toHaveBeenCalled();
  });

  it('says the site is unavailable when the token is not one of the account sites', async () => {
    mocks.listPublishedSites.mockResolvedValue({ sites: [], workspace: null });

    render(<SiteDetail token={TOKEN} />);

    expect(await screen.findByTestId('site-missing')).toHaveTextContent(
      'This site is not available',
    );
  });

  it('renames the site from Settings', async () => {
    mocks.updatePublishedSite.mockResolvedValue({
      token: TOKEN,
      shareUrl: site().shareUrl,
      title: 'Office league',
      visibility: 'public',
      organizationId: null,
      updatedAt: '2026-10-10T00:00:00.000Z',
    });

    render(<SiteDetail token={TOKEN} />);

    const input = await screen.findByLabelText('Site name');
    fireEvent.change(input, { target: { value: 'Office league' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.updatePublishedSite).toHaveBeenCalledWith(TOKEN, { title: 'Office league' }),
    );
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Office league');
  });

  it('shows the rename failure inline', async () => {
    mocks.updatePublishedSite.mockRejectedValue(new Error('That name is not allowed.'));

    render(<SiteDetail token={TOKEN} />);

    fireEvent.change(await screen.findByLabelText('Site name'), {
      target: { value: 'Something else' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That name is not allowed.');
  });

  it('keeps the workspace option closed to an account with no workspace', async () => {
    render(<SiteDetail token={TOKEN} />);

    const group = await screen.findByRole('radiogroup', { name: 'Who can open this site' });
    expect(within(group).getByRole('radio', { name: /your workspace/i })).toBeDisabled();
    expect(group).toHaveTextContent('Join or create a workspace');
  });

  it('moves the site to the workspace when the account has one', async () => {
    mocks.listPublishedSites.mockResolvedValue({ sites: [site()], workspace: { memberCount: 3 } });
    mocks.updatePublishedSite.mockResolvedValue({
      token: TOKEN,
      shareUrl: site().shareUrl,
      title: 'Team scoreboard',
      visibility: 'organization',
      organizationId: 'org-1',
      updatedAt: '2026-10-10T00:00:00.000Z',
    });

    render(<SiteDetail token={TOKEN} />);

    fireEvent.click(await screen.findByRole('radio', { name: /your workspace/i }));

    await waitFor(() =>
      expect(mocks.updatePublishedSite).toHaveBeenCalledWith(TOKEN, {
        visibility: 'organization',
      }),
    );
    expect(await screen.findByTestId('site-visibility')).toHaveTextContent('Organization');
  });

  it('lists versions and restores an older one', async () => {
    render(<SiteDetail token={TOKEN} />);

    const versions = await screen.findAllByTestId('site-version');
    expect(versions).toHaveLength(2);
    expect(versions[0]).toHaveTextContent('Live');
    fireEvent.click(within(versions[1]!).getByRole('button', { name: 'Restore' }));

    await waitFor(() =>
      expect(mocks.republishArtifactVersion).toHaveBeenCalledWith(
        expect.objectContaining({ token: TOKEN, artifactId: 'artifact-1' }),
        1,
      ),
    );
  });

  it('confirms before unpublishing, names the consequence, and leaves for the list', async () => {
    render(<SiteDetail token={TOKEN} />);

    fireEvent.click(await screen.findByTestId('site-unpublish'));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('stops working for everyone who has it');
    expect(dialog).toHaveTextContent('data the site saved for its visitors is deleted');
    expect(dialog).toHaveTextContent('This cannot be undone.');
    expect(mocks.unpublishArtifact).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Unpublish' }));

    await waitFor(() => expect(mocks.unpublishArtifact).toHaveBeenCalledWith(TOKEN));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/chat/sites'));
  });

  it('stays on the page and reports a failed unpublish', async () => {
    mocks.unpublishArtifact.mockRejectedValue(new Error('Network down'));

    render(<SiteDetail token={TOKEN} />);

    fireEvent.click(await screen.findByTestId('site-unpublish'));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Unpublish' }),
    );

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Network down'));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('shows shared data and only a count of personal data on the Data tab', async () => {
    render(<SiteDetail token={TOKEN} />);

    await openDataTab();

    expect(await screen.findByTestId('site-data-entry')).toHaveTextContent('scores');
    expect(screen.getByTestId('site-data-summary')).toHaveTextContent(
      '1 entry · 2.0 KB of 20.0 MB',
    );
    expect(screen.getByTestId('site-data-personal')).toHaveTextContent(
      'Each signed-in visitor’s own data stays private to them',
    );
    expect(screen.getByTestId('site-data-personal')).toHaveTextContent('You have 2 entries');
    expect(mocks.readPublishedSiteData).toHaveBeenCalledWith(TOKEN, expect.any(AbortSignal));
  });

  it('confirms before clearing shared data and reloads afterwards', async () => {
    render(<SiteDetail token={TOKEN} />);
    await openDataTab();

    fireEvent.click(await screen.findByRole('button', { name: 'Clear shared data' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('loses the 1 entry it shares between them');
    expect(dialog).toHaveTextContent("Each visitor's personal data is not touched");
    expect(dialog).toHaveTextContent('This cannot be undone.');
    expect(mocks.clearPublishedSiteSharedData).not.toHaveBeenCalled();

    mocks.readPublishedSiteData.mockResolvedValue(
      data({ shared: { entries: [], entryCount: 0, totalBytes: 0, limitBytes: 20 * 1024 * 1024 } }),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear shared data' }));

    await waitFor(() => expect(mocks.clearPublishedSiteSharedData).toHaveBeenCalledWith(TOKEN));
    expect(await screen.findByText('Nothing shared yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear shared data' })).toBeDisabled();
  });

  it('says a page that runs no script keeps no data', async () => {
    mocks.listPublishedSites.mockResolvedValue({
      sites: [site({ kind: 'markdown', sandboxed: false })],
      workspace: null,
    });
    mocks.readPublishedSiteData.mockResolvedValue(data({ supported: false }));

    render(<SiteDetail token={TOKEN} />);
    await openDataTab();

    expect(await screen.findByTestId('site-data-unsupported')).toHaveTextContent(
      'This site does not save data.',
    );
  });
});
