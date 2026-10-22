import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedSite } from '../../services/sites-service';
type SitesServiceModule = typeof import('../../services/sites-service');

const mocks = vi.hoisted(() => ({
  listPublishedSites: vi.fn(),
  unpublishArtifact: vi.fn(),
  updatePublishedSite: vi.fn(),
  readPublishedSiteVersion: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
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
}));

const { SitesPage } = await import('../SitesPage');
const { usePublishedSitesStore } = await import('../../stores/published-sites-store');

function site(overrides: Partial<PublishedSite> = {}): PublishedSite {
  return {
    token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    artifactId: 'artifact-1',
    conversationId: '11111111-1111-4111-8111-111111111111',
    title: 'Team scoreboard',
    kind: 'html',
    language: null,
    contentChars: 120,
    version: 2,
    visibility: 'public',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-09T00:00:00.000Z',
    shareUrl: 'https://agiworkforce.com/shared-artifact/aaaaaaaaaaaaaaaaaaaaaaaa',
    sandboxed: true,
    ...overrides,
  };
}

beforeEach(() => {
  usePublishedSitesStore.setState({ byArtifactId: {}, status: 'idle' });
  mocks.readPublishedSiteVersion.mockResolvedValue({
    version: 2,
    title: 'Team scoreboard',
    kind: 'html',
    language: null,
    content: '<h1>Scores</h1>',
  });
  mocks.unpublishArtifact.mockResolvedValue(undefined);
});

describe('SitesPage', () => {
  it('offers refresh and Create in the header and filters sites by title', async () => {
    mocks.listPublishedSites.mockResolvedValue({
      sites: [
        site(),
        site({
          token: 'bbbbbbbbbbbbbbbbbbbbbbbb',
          artifactId: 'artifact-2',
          title: 'Pricing page',
        }),
      ],
      workspace: null,
    });

    render(<SitesPage />);

    await screen.findByRole('list', { name: 'Your sites' });
    expect(screen.getByRole('link', { name: 'Create' })).toHaveAttribute('href', '/chat');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sites' }));
    await waitFor(() => expect(mocks.listPublishedSites).toHaveBeenCalledTimes(2));

    const search = await screen.findByRole('searchbox', { name: 'Search sites' });
    fireEvent.change(search, { target: { value: 'pricing' } });
    const list = screen.getByRole('list', { name: 'Your sites' });
    expect(within(list).queryByText('Team scoreboard')).toBeNull();
    expect(within(list).getByText('Pricing page')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByTestId('sites-no-match')).toBeInTheDocument();
  });

  it('explains how a site is made when the account has none', async () => {
    mocks.listPublishedSites.mockResolvedValue({ sites: [], workspace: null });

    render(<SitesPage />);

    const empty = await screen.findByTestId('sites-empty');
    expect(empty).toHaveTextContent('Ask AGI to build an app, then Publish it');
    expect(within(empty).getByRole('link', { name: 'Start a chat' })).toHaveAttribute(
      'href',
      '/chat',
    );
  });

  it('lists each site with its link, audience, and the routes to visit and edit it', async () => {
    mocks.listPublishedSites.mockResolvedValue({
      sites: [
        site(),
        site({
          token: 'bbbbbbbbbbbbbbbbbbbbbbbb',
          artifactId: 'artifact-2',
          conversationId: null,
          title: '',
          visibility: 'organization',
          updatedAt: '2026-10-10T00:00:00.000Z',
          shareUrl: 'https://agiworkforce.com/shared-artifact/bbbbbbbbbbbbbbbbbbbbbbbb',
        }),
      ],
      workspace: { memberCount: 4 },
    });

    render(<SitesPage />);

    const cards = await screen.findAllByTestId('site-card');
    expect(cards).toHaveLength(2);
    const [newest, older] = cards as [HTMLElement, HTMLElement];

    expect(within(newest).getByRole('link', { name: 'Untitled site' })).toHaveAttribute(
      'href',
      '/chat/sites/bbbbbbbbbbbbbbbbbbbbbbbb',
    );
    expect(within(newest).getByTestId('site-visibility')).toHaveTextContent('Organization');
    expect(within(newest).queryByRole('link', { name: /open in chat/i })).toBeNull();

    expect(within(older).getByTestId('site-visibility')).toHaveTextContent('Public');
    expect(
      within(older).getByText('agiworkforce.com/shared-artifact/aaaaaaaaaaaaaaaaaaaaaaaa'),
    ).toBeInTheDocument();
    expect(within(older).getByRole('link', { name: /visit/i })).toHaveAttribute(
      'href',
      '/shared-artifact/aaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(within(older).getByRole('link', { name: /open in chat/i })).toHaveAttribute(
      'href',
      '/chat/11111111-1111-4111-8111-111111111111?artifact=artifact-1',
    );

    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toMatchObject({
      token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      visibility: 'public',
    });
  });

  it('renders thumbnails that cannot take focus or pointer input', async () => {
    mocks.listPublishedSites.mockResolvedValue({ sites: [site()], workspace: null });

    render(<SitesPage />);

    const thumbnail = await screen.findByTestId('site-thumbnail');
    expect(thumbnail).toHaveAttribute('aria-hidden', 'true');
    expect(thumbnail).toHaveAttribute('inert');
    await waitFor(() =>
      expect(mocks.readPublishedSiteVersion).toHaveBeenCalledWith(
        'aaaaaaaaaaaaaaaaaaaaaaaa',
        2,
        expect.any(AbortSignal),
      ),
    );
  });

  it('copies the site link', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mocks.listPublishedSites.mockResolvedValue({ sites: [site()], workspace: null });

    render(<SitesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Copy link to Team scoreboard' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(site().shareUrl));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Link copied');
  });

  it('asks before unpublishing and names what is lost', async () => {
    mocks.listPublishedSites.mockResolvedValue({ sites: [site()], workspace: null });
    usePublishedSitesStore.getState().record('artifact-1', {
      shareUrl: site().shareUrl,
      visibility: 'public',
    });

    render(<SitesPage />);

    fireEvent.pointerDown(
      await screen.findByRole('button', { name: 'More actions for Team scoreboard' }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unpublish' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('stops working for everyone who has it');
    expect(dialog).toHaveTextContent('any data the site saved for its visitors is deleted');
    expect(dialog).toHaveTextContent('This cannot be undone.');
    expect(mocks.unpublishArtifact).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Unpublish' }));

    await waitFor(() => expect(mocks.unpublishArtifact).toHaveBeenCalledWith(site().token));
    await waitFor(() => expect(screen.queryByTestId('site-card')).toBeNull());
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toBeUndefined();
  });

  it('keeps the site listed when the unpublish is cancelled', async () => {
    mocks.listPublishedSites.mockResolvedValue({ sites: [site()], workspace: null });

    render(<SitesPage />);

    fireEvent.pointerDown(
      await screen.findByRole('button', { name: 'More actions for Team scoreboard' }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unpublish' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mocks.unpublishArtifact).not.toHaveBeenCalled();
    expect(screen.getByTestId('site-card')).toBeInTheDocument();
  });

  it('renames a site from the menu', async () => {
    mocks.listPublishedSites.mockResolvedValue({ sites: [site()], workspace: null });
    mocks.updatePublishedSite.mockResolvedValue({
      token: site().token,
      shareUrl: site().shareUrl,
      title: 'Office league',
      visibility: 'public',
      organizationId: null,
      updatedAt: '2026-10-10T12:00:00.000Z',
    });

    render(<SitesPage />);

    fireEvent.pointerDown(
      await screen.findByRole('button', { name: 'More actions for Team scoreboard' }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const input = await screen.findByLabelText('Name');
    fireEvent.change(input, { target: { value: 'Office league' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.updatePublishedSite).toHaveBeenCalledWith(site().token, {
        title: 'Office league',
      }),
    );
    expect(await screen.findByRole('link', { name: 'Office league' })).toBeInTheDocument();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    mocks.listPublishedSites.mockRejectedValueOnce(new Error('Server unavailable'));
    mocks.listPublishedSites.mockResolvedValueOnce({ sites: [], workspace: null });

    render(<SitesPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('sites-empty')).toBeInTheDocument();
  });
});
