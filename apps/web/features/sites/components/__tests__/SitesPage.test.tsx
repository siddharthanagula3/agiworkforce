import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const { usePublishedSite, usePublishedSitesStore } = await import('../../stores/published-sites-store');

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

type SiteList = Awaited<ReturnType<SitesServiceModule['listPublishedSites']>>;
const pendingLists: Array<{ resolve: (value: SiteList) => void; promise: Promise<SiteList> }> = [];

function deferredList() {
  let resolve!: (value: SiteList) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<SiteList>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  pendingLists.push({ resolve, promise });
  return { promise, resolve, reject };
}

function PublicationProbe() {
  const publication = usePublishedSite('artifact-1');
  return <output data-testid="publication-probe">{publication?.token ?? 'unpublished'}</output>;
}

afterEach(async () => {
  cleanup();
  usePublishedSitesStore.getState().hydrate([]);
  for (const pending of pendingLists) pending.resolve({ sites: [], workspace: null });
  await act(async () => {
    await Promise.allSettled(pendingLists.map((pending) => pending.promise));
  });
  pendingLists.length = 0;
  usePublishedSitesStore.getState().hydrate([]);
});

beforeEach(() => {
  usePublishedSitesStore.getState().hydrate([]);
  for (const mock of Object.values(mocks)) mock.mockReset();
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

  it('keeps a confirmed unpublish after a modeled route transition ahead of an older lazy read', async () => {
    const lazyList = deferredList();
    const pageList = deferredList();
    mocks.listPublishedSites
      .mockReturnValueOnce(lazyList.promise)
      .mockReturnValueOnce(pageList.promise);

    const view = render(<PublicationProbe />);
    expect(mocks.listPublishedSites).toHaveBeenCalledTimes(1);
    expect(usePublishedSitesStore.getState().status).toBe('loading');

    view.rerender(<SitesPage />);
    expect(mocks.listPublishedSites).toHaveBeenCalledTimes(2);
    await act(async () => {
      pageList.resolve({ sites: [site()], workspace: null });
      await pageList.promise;
    });
    expect(await screen.findByTestId('site-card')).toBeInTheDocument();
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toBeDefined();

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'More actions for Team scoreboard' }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unpublish' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(mocks.unpublishArtifact).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unpublish' }));
    await waitFor(() => expect(mocks.unpublishArtifact).toHaveBeenCalledWith(site().token));
    expect(await screen.findByTestId('sites-empty')).toBeInTheDocument();
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toBeUndefined();

    await act(async () => {
      lazyList.resolve({ sites: [site()], workspace: null });
      await lazyList.promise;
    });
    expect(usePublishedSitesStore.getState().status).toBe('ready');
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toBeUndefined();
    view.rerender(<PublicationProbe />);
    expect(screen.getByTestId('publication-probe')).toHaveTextContent('unpublished');
    expect(mocks.listPublishedSites).toHaveBeenCalledTimes(2);
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


describe('SitesPage bounded read ownership (source fixtures; router transitions modeled)', () => {
  it.each(['success', 'error'] as const)(
    'keeps confirmed unpublish after remount ahead of old Refresh %s',
    async (outcome) => {
      const refresh = deferredList();
      mocks.listPublishedSites
        .mockResolvedValueOnce({ sites: [site()], workspace: null })
        .mockReturnValueOnce(refresh.promise)
        .mockResolvedValueOnce({ sites: [site()], workspace: null });
      const oldView = render(<SitesPage />);
      await screen.findByTestId('site-card');
      fireEvent.click(screen.getByRole('button', { name: 'Refresh sites' }));
      expect(screen.queryByTestId('site-card')).toBeNull();
      expect(screen.getByRole('button', { name: 'Refresh sites' })).toBeDisabled();
      const refreshSignal = mocks.listPublishedSites.mock.calls[1]?.[0] as AbortSignal;
      expect(refreshSignal).toBeInstanceOf(AbortSignal);
      expect(refreshSignal.aborted).toBe(false);

      // Explicit unmount/remount models Sites -> Library -> Sites, not router execution.
      oldView.unmount();
      expect(refreshSignal.aborted).toBe(true);
      render(<SitesPage />);
      fireEvent.pointerDown(
        await screen.findByRole('button', { name: 'More actions for Team scoreboard' }),
        { button: 0, ctrlKey: false },
      );
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Unpublish' }));
      const dialog = await screen.findByRole('alertdialog');
      expect(mocks.unpublishArtifact).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Unpublish' }));
      await waitFor(() => expect(mocks.unpublishArtifact).toHaveBeenCalledWith(site().token));
      await screen.findByTestId('sites-empty');
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toBeUndefined();

      await act(async () => {
        if (outcome === 'success') refresh.resolve({ sites: [site()], workspace: null });
        else refresh.reject(new Error('Retired refresh failed'));
        await Promise.allSettled([refresh.promise]);
      });
      expect(usePublishedSitesStore.getState().status).toBe('ready');
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toBeUndefined();
      expect(screen.getByTestId('sites-empty')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(mocks.listPublishedSites).toHaveBeenCalledTimes(3);
    },
  );

  it('does not refill public visibility after remounted sharing succeeds and an old Refresh resolves', async () => {
    const refresh = deferredList();
    mocks.listPublishedSites
      .mockResolvedValueOnce({ sites: [site()], workspace: { memberCount: 4 } })
      .mockReturnValueOnce(refresh.promise)
      .mockResolvedValueOnce({ sites: [site()], workspace: { memberCount: 4 } });
    mocks.updatePublishedSite.mockResolvedValue({
      token: site().token,
      shareUrl: site().shareUrl,
      title: site().title,
      visibility: 'organization',
      organizationId: 'workspace-1',
      updatedAt: '2026-10-10T12:00:00.000Z',
    });
    const oldView = render(<SitesPage />);
    await screen.findByTestId('site-card');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sites' }));
    expect(screen.queryByTestId('site-card')).toBeNull();
    oldView.unmount();
    render(<SitesPage />);
    fireEvent.pointerDown(
      await screen.findByRole('button', { name: 'More actions for Team scoreboard' }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sharing' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sharing' });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Your workspace/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.updatePublishedSite).toHaveBeenCalledWith(site().token, {
      visibility: 'organization',
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.visibility).toBe('organization');
    await act(async () => {
      refresh.resolve({ sites: [site()], workspace: null });
      await refresh.promise;
    });
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.visibility).toBe('organization');
    expect(screen.getByTestId('site-visibility')).toHaveTextContent('Organization');
  });

  it.each(['success', 'error'] as const)(
    'aborts an unmounted initial read and ignores its late %s',
    async (outcome) => {
      const initial = deferredList();
      mocks.listPublishedSites.mockReturnValueOnce(initial.promise);
      const view = render(<SitesPage />);
      const signal = mocks.listPublishedSites.mock.calls[0]?.[0] as AbortSignal;
      expect(signal).toBeInstanceOf(AbortSignal);
      view.unmount();
      expect(signal.aborted).toBe(true);
      usePublishedSitesStore.getState().hydrate([site({ visibility: 'invited' })]);
      await act(async () => {
        if (outcome === 'success') initial.resolve({ sites: [site()], workspace: null });
        else initial.reject(new Error('Retired initial read failed'));
        await Promise.allSettled([initial.promise]);
      });
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.visibility).toBe('invited');
      expect(usePublishedSitesStore.getState().status).toBe('ready');
    },
  );

  it('owns a manual Retry until completion and releases the settled request', async () => {
    const retry = deferredList();
    mocks.listPublishedSites
      .mockRejectedValueOnce(new Error('Initial read failed'))
      .mockReturnValueOnce(retry.promise);
    const view = render(<SitesPage />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    const retrySignal = mocks.listPublishedSites.mock.calls[1]?.[0] as AbortSignal;
    expect(retrySignal).toBeInstanceOf(AbortSignal);
    expect(retrySignal.aborted).toBe(false);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    await act(async () => {
      retry.resolve({ sites: [site()], workspace: null });
      await retry.promise;
    });
    expect(screen.getByTestId('site-card')).toBeInTheDocument();
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.token).toBe(site().token);
    view.unmount();
    expect(retrySignal.aborted).toBe(false);
  });

  it.each(['success', 'error'] as const)(
    'aborts manual Retry on unmount and ignores its late %s',
    async (outcome) => {
      const retry = deferredList();
      mocks.listPublishedSites
        .mockRejectedValueOnce(new Error('Initial read failed'))
        .mockReturnValueOnce(retry.promise);
      const view = render(<SitesPage />);
      await screen.findByRole('alert');
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      const signal = mocks.listPublishedSites.mock.calls[1]?.[0] as AbortSignal;
      expect(signal).toBeInstanceOf(AbortSignal);
      view.unmount();
      expect(signal.aborted).toBe(true);
      usePublishedSitesStore.getState().hydrate([]);
      await act(async () => {
        if (outcome === 'success') retry.resolve({ sites: [site()], workspace: null });
        else retry.reject(new Error('Retired retry failed'));
        await Promise.allSettled([retry.promise]);
      });
      expect(usePublishedSitesStore.getState().byArtifactId).toEqual({});
      expect(usePublishedSitesStore.getState().status).toBe('ready');
    },
  );

  it.each(['success', 'error'] as const)(
    'keeps the committed StrictMode replay ahead of retired setup %s',
    async (outcome) => {
      const retired = deferredList();
      const current = deferredList();
      mocks.listPublishedSites
        .mockReturnValueOnce(retired.promise)
        .mockReturnValueOnce(current.promise);
      render(<StrictMode><SitesPage /></StrictMode>);
      expect(mocks.listPublishedSites).toHaveBeenCalledTimes(2);
      const firstSignal = mocks.listPublishedSites.mock.calls[0]?.[0] as AbortSignal;
      const secondSignal = mocks.listPublishedSites.mock.calls[1]?.[0] as AbortSignal;
      expect(firstSignal.aborted).toBe(true);
      expect(secondSignal.aborted).toBe(false);
      expect(secondSignal).not.toBe(firstSignal);
      await act(async () => {
        current.resolve({ sites: [site({ visibility: 'invited' })], workspace: null });
        await current.promise;
      });
      await act(async () => {
        if (outcome === 'success') retired.resolve({ sites: [site()], workspace: null });
        else retired.reject(new Error('Retired StrictMode setup failed'));
        await Promise.allSettled([retired.promise]);
      });
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.visibility).toBe('invited');
      expect(screen.getByTestId('site-visibility')).toHaveTextContent('Invited');
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('makes an unexpected current AbortError retryable instead of leaving loading permanent', async () => {
    mocks.listPublishedSites
      .mockRejectedValueOnce(new DOMException('Transport stopped', 'AbortError'))
      .mockResolvedValueOnce({ sites: [site()], workspace: null });
    render(<SitesPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    const initialSignal = mocks.listPublishedSites.mock.calls[0]?.[0] as AbortSignal;
    expect(initialSignal.aborted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('site-card')).toBeInTheDocument();
    expect(mocks.listPublishedSites).toHaveBeenCalledTimes(2);
  });

  it('rechecks ownership after synchronous hydration subscriber retirement (effect replacement model)', async () => {
    const first = deferredList();
    const replacement = deferredList();
    const originalHydrate = usePublishedSitesStore.getState().hydrate;
    mocks.listPublishedSites
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(replacement.promise);
    render(<SitesPage />);
    const firstSignal = mocks.listPublishedSites.mock.calls[0]?.[0] as AbortSignal;
    let retireOnHydration = true;
    const unsubscribe = usePublishedSitesStore.subscribe((state) => {
      if (!retireOnHydration || !state.byArtifactId['artifact-1']) return;
      retireOnHydration = false;
      // Changing the selected hydrate identity synchronously retires and replaces the effect.
      flushSync(() => {
        usePublishedSitesStore.setState({ hydrate: (sites) => originalHydrate(sites) });
      });
    });
    try {
      await act(async () => {
        first.resolve({ sites: [site()], workspace: null });
        await first.promise;
      });
      expect(firstSignal.aborted).toBe(true);
      expect(mocks.listPublishedSites).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId('site-card')).toBeNull();
      expect(screen.getByRole('button', { name: 'Refresh sites' })).toBeDisabled();
      const replacementSignal = mocks.listPublishedSites.mock.calls[1]?.[0] as AbortSignal;
      expect(replacementSignal.aborted).toBe(false);
      await act(async () => {
        replacement.resolve({ sites: [site({ visibility: 'invited' })], workspace: null });
        await replacement.promise;
      });
      expect(screen.getByTestId('site-visibility')).toHaveTextContent('Invited');
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.visibility).toBe('invited');
    } finally {
      unsubscribe();
      cleanup();
      usePublishedSitesStore.setState({ hydrate: originalHydrate });
    }
  });
});
