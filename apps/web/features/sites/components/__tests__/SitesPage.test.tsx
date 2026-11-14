import { StrictMode } from 'react';
import { flushSync } from 'react-dom';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedSite } from '../../services/sites-service';
type SitesServiceModule = typeof import('../../services/sites-service');

const mocks = vi.hoisted(() => ({
  listPublishedSites: vi.fn(),
  listPublishedSitesPage: vi.fn(),
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
  listPublishedSitesPage: (...args: unknown[]) => mocks.listPublishedSitesPage(...args),
  unpublishArtifact: (...args: unknown[]) => mocks.unpublishArtifact(...args),
  updatePublishedSite: (...args: unknown[]) => mocks.updatePublishedSite(...args),
  readPublishedSiteVersion: (...args: unknown[]) => mocks.readPublishedSiteVersion(...args),
}));

const { SitesPage } = await import('../SitesPage');
const {
  usePublishedSite,
  usePublishedSitesStore,
  beginPublicationCleanup,
  capturePublicationLease,
} = await import('../../stores/published-sites-store');

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

type SiteList = Awaited<ReturnType<SitesServiceModule['listPublishedSitesPage']>>;
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
  beginPublicationCleanup()();
  for (const pending of pendingLists)
    pending.resolve({ sites: [], workspace: null, nextCursor: null });
  await act(async () => {
    await Promise.allSettled(pendingLists.map((pending) => pending.promise));
  });
  pendingLists.length = 0;
  beginPublicationCleanup()();
});

beforeEach(() => {
  beginPublicationCleanup()();
  for (const mock of Object.values(mocks)) mock.mockReset();
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
    mocks.listPublishedSitesPage.mockResolvedValue({
      sites: [
        site(),
        site({
          token: 'bbbbbbbbbbbbbbbbbbbbbbbb',
          artifactId: 'artifact-2',
          title: 'Pricing page',
        }),
      ],
      workspace: null,
      nextCursor: null,
    });

    render(<SitesPage />);

    await screen.findByRole('list', { name: 'Your sites' });
    expect(screen.getByRole('link', { name: 'Create' })).toHaveAttribute('href', '/chat');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sites' }));
    await waitFor(() => expect(mocks.listPublishedSitesPage).toHaveBeenCalledTimes(2));

    const search = await screen.findByRole('searchbox', { name: 'Search sites' });
    fireEvent.change(search, { target: { value: 'pricing' } });
    const list = screen.getByRole('list', { name: 'Your sites' });
    expect(within(list).queryByText('Team scoreboard')).toBeNull();
    expect(within(list).getByText('Pricing page')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByTestId('sites-no-match')).toBeInTheDocument();
  });

  it('explains how a site is made when the account has none', async () => {
    mocks.listPublishedSitesPage.mockResolvedValue({
      sites: [],
      workspace: null,
      nextCursor: null,
    });

    render(<SitesPage />);

    const empty = await screen.findByTestId('sites-empty');
    expect(empty).toHaveTextContent('Ask AGI to build an app, then Publish it');
    expect(within(empty).getByRole('link', { name: 'Start a chat' })).toHaveAttribute(
      'href',
      '/chat',
    );
  });

  it('lists each site with its link, audience, and the routes to visit and edit it', async () => {
    mocks.listPublishedSitesPage.mockResolvedValue({
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
      nextCursor: null,
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
    mocks.listPublishedSitesPage.mockResolvedValue({
      sites: [site()],
      workspace: null,
      nextCursor: null,
    });

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
    mocks.listPublishedSitesPage.mockResolvedValue({
      sites: [site()],
      workspace: null,
      nextCursor: null,
    });

    render(<SitesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Copy link to Team scoreboard' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(site().shareUrl));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Link copied');
  });

  it('asks before unpublishing and names what is lost', async () => {
    mocks.listPublishedSitesPage.mockResolvedValue({
      sites: [site()],
      workspace: null,
      nextCursor: null,
    });
    usePublishedSitesStore.getState().record(
      'artifact-1',
      {
        shareUrl: site().shareUrl,
        visibility: 'public',
      },
      capturePublicationLease()!,
    );

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
    mocks.listPublishedSites.mockReturnValueOnce(lazyList.promise);
    mocks.listPublishedSitesPage.mockReturnValueOnce(pageList.promise);

    const view = render(<PublicationProbe />);
    expect(mocks.listPublishedSites).toHaveBeenCalledTimes(1);
    expect(mocks.listPublishedSitesPage).not.toHaveBeenCalled();
    expect(usePublishedSitesStore.getState().status).toBe('loading');

    view.rerender(<SitesPage />);
    expect(mocks.listPublishedSitesPage).toHaveBeenCalledTimes(1);
    await act(async () => {
      pageList.resolve({ sites: [site()], workspace: null, nextCursor: null });
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
      lazyList.resolve({ sites: [site()], workspace: null, nextCursor: null });
      await lazyList.promise;
    });
    expect(usePublishedSitesStore.getState().status).toBe('ready');
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toBeUndefined();
    view.rerender(<PublicationProbe />);
    expect(screen.getByTestId('publication-probe')).toHaveTextContent('unpublished');
    expect(mocks.listPublishedSites).toHaveBeenCalledTimes(1);
    expect(mocks.listPublishedSitesPage).toHaveBeenCalledTimes(1);
  });

  it('keeps the site listed when the unpublish is cancelled', async () => {
    mocks.listPublishedSitesPage.mockResolvedValue({
      sites: [site()],
      workspace: null,
      nextCursor: null,
    });

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
    mocks.listPublishedSitesPage.mockResolvedValue({
      sites: [site()],
      workspace: null,
      nextCursor: null,
    });
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
    mocks.listPublishedSitesPage.mockRejectedValueOnce(new Error('Server unavailable'));
    mocks.listPublishedSitesPage.mockResolvedValueOnce({
      sites: [],
      workspace: null,
      nextCursor: null,
    });

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
      mocks.listPublishedSitesPage
        .mockResolvedValueOnce({ sites: [site()], workspace: null, nextCursor: null })
        .mockReturnValueOnce(refresh.promise)
        .mockResolvedValueOnce({ sites: [site()], workspace: null, nextCursor: null });
      const oldView = render(<SitesPage />);
      await screen.findByTestId('site-card');
      fireEvent.click(screen.getByRole('button', { name: 'Refresh sites' }));
      expect(screen.getByTestId('site-card')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Refresh sites' })).toBeDisabled();
      const refreshSignal = mocks.listPublishedSitesPage.mock.calls[1]?.[1] as AbortSignal;
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
        if (outcome === 'success')
          refresh.resolve({ sites: [site()], workspace: null, nextCursor: null });
        else refresh.reject(new Error('Retired refresh failed'));
        await Promise.allSettled([refresh.promise]);
      });
      expect(usePublishedSitesStore.getState().status).toBe('idle');
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toBeUndefined();
      expect(screen.getByTestId('sites-empty')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(mocks.listPublishedSitesPage).toHaveBeenCalledTimes(3);
    },
  );

  it('does not refill public visibility after remounted sharing succeeds and an old Refresh resolves', async () => {
    const refresh = deferredList();
    mocks.listPublishedSitesPage
      .mockResolvedValueOnce({ sites: [site()], workspace: { memberCount: 4 }, nextCursor: null })
      .mockReturnValueOnce(refresh.promise)
      .mockResolvedValueOnce({ sites: [site()], workspace: { memberCount: 4 }, nextCursor: null });
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
    expect(screen.getByTestId('site-card')).toBeInTheDocument();
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
    await waitFor(() =>
      expect(mocks.updatePublishedSite).toHaveBeenCalledWith(site().token, {
        visibility: 'organization',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.visibility).toBe(
      'organization',
    );
    await act(async () => {
      refresh.resolve({ sites: [site()], workspace: null, nextCursor: null });
      await refresh.promise;
    });
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.visibility).toBe(
      'organization',
    );
    expect(screen.getByTestId('site-visibility')).toHaveTextContent('Organization');
  });

  it.each(['success', 'error'] as const)(
    'aborts an unmounted initial read and ignores its late %s',
    async (outcome) => {
      const initial = deferredList();
      mocks.listPublishedSitesPage.mockReturnValueOnce(initial.promise);
      const view = render(<SitesPage />);
      const signal = mocks.listPublishedSitesPage.mock.calls[0]?.[1] as AbortSignal;
      expect(signal).toBeInstanceOf(AbortSignal);
      view.unmount();
      expect(signal.aborted).toBe(true);
      usePublishedSitesStore
        .getState()
        .hydrate([site({ visibility: 'invited' })], capturePublicationLease()!);
      await act(async () => {
        if (outcome === 'success')
          initial.resolve({ sites: [site()], workspace: null, nextCursor: null });
        else initial.reject(new Error('Retired initial read failed'));
        await Promise.allSettled([initial.promise]);
      });
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.visibility).toBe(
        'invited',
      );
      expect(usePublishedSitesStore.getState().status).toBe('ready');
    },
  );

  it('owns a manual Retry until completion and releases the settled request', async () => {
    const retry = deferredList();
    mocks.listPublishedSitesPage
      .mockRejectedValueOnce(new Error('Initial read failed'))
      .mockReturnValueOnce(retry.promise);
    const view = render(<SitesPage />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    const retrySignal = mocks.listPublishedSitesPage.mock.calls[1]?.[1] as AbortSignal;
    expect(retrySignal).toBeInstanceOf(AbortSignal);
    expect(retrySignal.aborted).toBe(false);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    await act(async () => {
      retry.resolve({ sites: [site()], workspace: null, nextCursor: null });
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
      mocks.listPublishedSitesPage
        .mockRejectedValueOnce(new Error('Initial read failed'))
        .mockReturnValueOnce(retry.promise);
      const view = render(<SitesPage />);
      await screen.findByRole('alert');
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      const signal = mocks.listPublishedSitesPage.mock.calls[1]?.[1] as AbortSignal;
      expect(signal).toBeInstanceOf(AbortSignal);
      view.unmount();
      expect(signal.aborted).toBe(true);
      usePublishedSitesStore.getState().hydrate([], capturePublicationLease()!);
      await act(async () => {
        if (outcome === 'success')
          retry.resolve({ sites: [site()], workspace: null, nextCursor: null });
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
      mocks.listPublishedSitesPage
        .mockReturnValueOnce(retired.promise)
        .mockReturnValueOnce(current.promise);
      render(
        <StrictMode>
          <SitesPage />
        </StrictMode>,
      );
      expect(mocks.listPublishedSitesPage).toHaveBeenCalledTimes(2);
      const firstSignal = mocks.listPublishedSitesPage.mock.calls[0]?.[1] as AbortSignal;
      const secondSignal = mocks.listPublishedSitesPage.mock.calls[1]?.[1] as AbortSignal;
      expect(firstSignal.aborted).toBe(true);
      expect(secondSignal.aborted).toBe(false);
      expect(secondSignal).not.toBe(firstSignal);
      await act(async () => {
        current.resolve({
          sites: [site({ visibility: 'invited' })],
          workspace: null,
          nextCursor: null,
        });
        await current.promise;
      });
      await act(async () => {
        if (outcome === 'success')
          retired.resolve({ sites: [site()], workspace: null, nextCursor: null });
        else retired.reject(new Error('Retired StrictMode setup failed'));
        await Promise.allSettled([retired.promise]);
      });
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.visibility).toBe(
        'invited',
      );
      expect(screen.getByTestId('site-visibility')).toHaveTextContent('Invited');
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('makes an unexpected current AbortError retryable instead of leaving loading permanent', async () => {
    mocks.listPublishedSitesPage
      .mockRejectedValueOnce(new DOMException('Transport stopped', 'AbortError'))
      .mockResolvedValueOnce({ sites: [site()], workspace: null, nextCursor: null });
    render(<SitesPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    const initialSignal = mocks.listPublishedSitesPage.mock.calls[0]?.[1] as AbortSignal;
    expect(initialSignal.aborted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('site-card')).toBeInTheDocument();
    expect(mocks.listPublishedSitesPage).toHaveBeenCalledTimes(2);
  });

  it('rechecks ownership after synchronous record subscriber retirement (effect replacement model)', async () => {
    const first = deferredList();
    const replacement = deferredList();
    const originalRecord = usePublishedSitesStore.getState().record;
    mocks.listPublishedSitesPage
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(replacement.promise);
    render(<SitesPage />);
    const firstSignal = mocks.listPublishedSitesPage.mock.calls[0]?.[1] as AbortSignal;
    let retireOnRecord = true;
    const unsubscribe = usePublishedSitesStore.subscribe((state) => {
      if (!retireOnRecord || !state.byArtifactId['artifact-1']) return;
      retireOnRecord = false;
      // Replacing the selected record function models synchronous subscriber retirement.
      flushSync(() => {
        usePublishedSitesStore.setState({
          record: (artifactId, details, lease) => originalRecord(artifactId, details, lease),
        });
      });
    });
    try {
      await act(async () => {
        first.resolve({ sites: [site()], workspace: null, nextCursor: null });
        await first.promise;
      });
      expect(firstSignal.aborted).toBe(true);
      expect(mocks.listPublishedSitesPage).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId('site-card')).toBeNull();
      expect(screen.getByRole('button', { name: 'Refresh sites' })).toBeDisabled();
      const replacementSignal = mocks.listPublishedSitesPage.mock.calls[1]?.[1] as AbortSignal;
      expect(replacementSignal.aborted).toBe(false);
      await act(async () => {
        replacement.resolve({
          sites: [site({ visibility: 'invited' })],
          workspace: null,
          nextCursor: null,
        });
        await replacement.promise;
      });
      expect(screen.getByTestId('site-visibility')).toHaveTextContent('Invited');
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.visibility).toBe(
        'invited',
      );
    } finally {
      unsubscribe();
      cleanup();
      usePublishedSitesStore.setState({ record: originalRecord });
    }
  });
});

describe('SitesPage bounded page navigation (UNRUN source fixtures)', () => {
  it('replaces one page at a time, keeps unrelated cache entries, and scopes search to the page', async () => {
    const older = site({
      token: 'b'.repeat(24),
      artifactId: 'artifact-2',
      title: 'Older page',
      shareUrl: `https://agiworkforce.com/shared-artifact/${'b'.repeat(24)}`,
    });
    mocks.listPublishedSitesPage
      .mockResolvedValueOnce({ sites: [site()], workspace: null, nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ sites: [older], workspace: null, nextCursor: 'cursor-3' })
      .mockResolvedValueOnce({ sites: [site()], workspace: null, nextCursor: 'cursor-2' });
    render(<SitesPage />);
    await screen.findByTestId('site-card');
    expect(mocks.listPublishedSitesPage).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Search and sorting apply to this page only/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to newest' })).toBeDisabled();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Older page' } });
    expect(screen.getByTestId('sites-no-match')).toBeInTheDocument();
    expect(mocks.listPublishedSitesPage).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Older' }));
    await screen.findByRole('link', { name: 'Older page' });
    expect(screen.getAllByTestId('site-card')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Team scoreboard' })).toBeNull();
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.token).toBe(site().token);
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-2']?.token).toBe(older.token);
    expect(mocks.listPublishedSitesPage.mock.calls.map(([cursor]) => cursor)).toEqual([
      null,
      'cursor-2',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Back to newest' }));
    await screen.findByRole('link', { name: 'Team scoreboard' });
    expect(screen.queryByRole('link', { name: 'Older page' })).toBeNull();
    expect(mocks.listPublishedSitesPage.mock.calls.map(([cursor]) => cursor)).toEqual([
      null,
      'cursor-2',
      null,
    ]);
    expect(mocks.listPublishedSites).not.toHaveBeenCalled();
  });

  it('retains a failed continuation page, retries its exact cursor, and can leave an empty older page', async () => {
    const continuation = deferredList();
    mocks.listPublishedSitesPage
      .mockResolvedValueOnce({ sites: [site()], workspace: null, nextCursor: 'cursor-2' })
      .mockReturnValueOnce(continuation.promise)
      .mockResolvedValueOnce({ sites: [], workspace: null, nextCursor: null })
      .mockResolvedValueOnce({ sites: [site()], workspace: null, nextCursor: 'cursor-2' });
    render(<SitesPage />);
    await screen.findByTestId('site-card');
    fireEvent.click(screen.getByRole('button', { name: 'Older' }));
    expect(screen.getByTestId('site-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Older' })).toBeDisabled();
    await act(async () => continuation.reject(new Error('Continuation unavailable')));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('site-card')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('No sites on this page.');
    expect(screen.queryByTestId('sites-empty')).toBeNull();
    expect(screen.getByRole('button', { name: 'Back to newest' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Older' })).toBeDisabled();
    expect(mocks.listPublishedSitesPage.mock.calls.map(([cursor]) => cursor)).toEqual([
      null,
      'cursor-2',
      'cursor-2',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sites' }));
    await screen.findByTestId('site-card');
    expect(mocks.listPublishedSitesPage.mock.lastCall![0]).toBeNull();
    expect(mocks.listPublishedSitesPage).toHaveBeenCalledTimes(4);
  });

  it('stops a page record loop when its first synchronous subscriber starts cleanup', async () => {
    const page = deferredList();
    const second = site({
      token: 'b'.repeat(24),
      artifactId: 'artifact-2',
      title: 'Must not record',
      shareUrl: `https://agiworkforce.com/shared-artifact/${'b'.repeat(24)}`,
    });
    mocks.listPublishedSitesPage.mockReturnValueOnce(page.promise);
    const mounted = render(<SitesPage />);
    let finish = () => {};
    let retired = false;
    const unsubscribe = usePublishedSitesStore.subscribe((state) => {
      if (retired || !state.byArtifactId['artifact-1']) return;
      retired = true;
      finish = beginPublicationCleanup();
    });
    try {
      await act(async () =>
        page.resolve({ sites: [site(), second], workspace: null, nextCursor: 'cursor-2' }),
      );
      expect(retired).toBe(true);
      expect(usePublishedSitesStore.getState().byArtifactId).toEqual({});
      expect(screen.queryByText('Must not record')).toBeNull();
      expect(screen.queryByTestId('site-card')).toBeNull();
      expect((mocks.listPublishedSitesPage.mock.calls[0]![1] as AbortSignal).aborted).toBe(true);
      expect(mocks.listPublishedSitesPage).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
      mounted.unmount();
      finish();
    }
  });
});

describe('SitesPage common cleanup ownership model', () => {
  it('does not refill a mounted list or cache with an old read after cleanup release', async () => {
    const oldRead = deferredList();
    const newRead = deferredList();
    mocks.listPublishedSitesPage
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(newRead.promise);
    render(<SitesPage />);
    const signal = mocks.listPublishedSitesPage.mock.calls[0]![1] as AbortSignal;
    let finish = () => {};
    try {
      act(() => {
        finish = beginPublicationCleanup();
      });
      expect(signal.aborted).toBe(true);
      expect(usePublishedSitesStore.getState().lease).toBeNull();
      act(() => finish());
      await act(async () =>
        oldRead.resolve({
          sites: [site({ title: 'Retired card' })],
          workspace: null,
          nextCursor: null,
        }),
      );
      expect(screen.queryByText('Retired card')).not.toBeInTheDocument();
      expect(usePublishedSitesStore.getState().byArtifactId).toEqual({});
      await act(async () =>
        newRead.resolve({
          sites: [site({ title: 'Current card' })],
          workspace: null,
          nextCursor: null,
        }),
      );
      expect(screen.getByTestId('site-card')).toHaveTextContent('Current card');
      expect(mocks.listPublishedSitesPage).toHaveBeenCalledTimes(2);
    } finally {
      cleanup();
      finish();
      await act(async () => {
        oldRead.resolve({ sites: [], workspace: null, nextCursor: null });
        newRead.resolve({ sites: [], workspace: null, nextCursor: null });
      });
    }
  });
});
