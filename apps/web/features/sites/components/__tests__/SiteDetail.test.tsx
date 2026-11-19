import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedSite, SiteData } from '../../services/sites-service';
type SiteActionsModule = typeof import('../../hooks/useSiteActions');
type SitesServiceModule = typeof import('../../services/sites-service');

const mocks = vi.hoisted(() => ({
  observeActions: vi.fn(),
  push: vi.fn(),
  listPublishedSites: vi.fn(),
  listPublishedSitesPage: vi.fn(),
  readPublishedSite: vi.fn(),
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

vi.mock('../../hooks/useSiteActions', async (importOriginal) => {
  const actual = await importOriginal<SiteActionsModule>();
  return {
    ...actual,
    useSiteActions: (callbacks: Parameters<SiteActionsModule['useSiteActions']>[0]) => {
      mocks.observeActions(callbacks);
      return actual.useSiteActions(callbacks);
    },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock('../../services/sites-service', async (importOriginal) => ({
  ...(await importOriginal<SitesServiceModule>()),
  listPublishedSites: (...args: unknown[]) => mocks.listPublishedSites(...args),
  listPublishedSitesPage: (...args: unknown[]) => mocks.listPublishedSitesPage(...args),
  readPublishedSite: (...args: unknown[]) => mocks.readPublishedSite(...args),
  unpublishArtifact: (...args: unknown[]) => mocks.unpublishArtifact(...args),
  updatePublishedSite: (...args: unknown[]) => mocks.updatePublishedSite(...args),
  readPublishedSiteVersion: (...args: unknown[]) => mocks.readPublishedSiteVersion(...args),
  listPublishedArtifactVersions: (...args: unknown[]) =>
    mocks.listPublishedArtifactVersions(...args),
  republishArtifactVersion: (...args: unknown[]) => mocks.republishArtifactVersion(...args),
  readPublishedSiteData: (...args: unknown[]) => mocks.readPublishedSiteData(...args),
  clearPublishedSiteSharedData: (...args: unknown[]) => mocks.clearPublishedSiteSharedData(...args),
}));

// Invited-viewer GETs are outside the rename/sharing composition boundary.
vi.mock('../SiteViewersEditor', () => ({ SiteViewersEditor: () => null }));

const { SiteDetail } = await import('../SiteDetail');
const { usePublishedSitesStore, beginPublicationCleanup, capturePublicationLease } =
  await import('../../stores/published-sites-store');

type UpdateResponse = Awaited<ReturnType<SitesServiceModule['updatePublishedSite']>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function deferredUpdate() {
  let resolve!: (value: UpdateResponse) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<UpdateResponse>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

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
    shareUrl: `https://agiworkforce.com/shared-artifact/${overrides.token ?? TOKEN}`,
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
  beginPublicationCleanup()();
  mocks.readPublishedSite.mockResolvedValue({ site: site(), workspace: null });
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

afterEach(() => {
  cleanup();
  beginPublicationCleanup()();
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
    expect(mocks.readPublishedSite).toHaveBeenCalledWith(TOKEN, expect.any(AbortSignal));
    expect(mocks.readPublishedSite).toHaveBeenCalledTimes(1);
    expect(mocks.listPublishedSites).not.toHaveBeenCalled();
    expect(mocks.listPublishedSitesPage).not.toHaveBeenCalled();
  });

  it('says the site is unavailable when the token is not one of the account sites', async () => {
    mocks.readPublishedSite.mockResolvedValue(null);

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

  it.each(['sharing', 'rename'] as const)(
    'composes independent settings when %s completes first',
    async (first) => {
      const rename = deferredUpdate();
      const sharing = deferredUpdate();
      mocks.readPublishedSite.mockResolvedValue({
        site: site({ visibility: 'invited' }),
        workspace: null,
      });
      mocks.updatePublishedSite.mockImplementation((_token: string, change: { title?: string }) =>
        change.title === undefined ? sharing.promise : rename.promise,
      );
      render(<SiteDetail token={TOKEN} />);

      fireEvent.change(await screen.findByLabelText('Site name'), {
        target: { value: 'Office league' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      fireEvent.click(screen.getByRole('radio', { name: /anyone with the link/i }));
      expect(mocks.updatePublishedSite.mock.calls).toEqual([
        [TOKEN, { title: 'Office league' }],
        [TOKEN, { visibility: 'public' }],
      ]);

      const responses: Record<'rename' | 'sharing', UpdateResponse> = {
        rename: {
          token: TOKEN,
          title: 'Office league',
          visibility: 'invited',
          shareUrl: site().shareUrl,
          organizationId: null,
          updatedAt: '2026-10-10T00:00:00.000Z',
        },
        sharing: {
          token: TOKEN,
          title: 'Office league',
          visibility: 'public',
          shareUrl: site().shareUrl,
          organizationId: null,
          updatedAt: '2026-10-10T00:00:01.000Z',
        },
      };
      const pending = { rename, sharing };
      await act(async () => pending[first].resolve(responses[first]));
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        first === 'rename' ? 'Office league' : 'Team scoreboard',
      );
      expect(screen.getByRole('radio', { name: /anyone with the link/i })).toHaveAttribute(
        'aria-checked',
        first === 'sharing' ? 'true' : 'false',
      );

      const last = first === 'rename' ? 'sharing' : 'rename';
      await act(async () => pending[last].resolve(responses[last]));
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Office league');
      expect(screen.getByTestId('site-visibility')).toHaveTextContent('Public');
      expect(screen.getByRole('radio', { name: /anyone with the link/i })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(screen.getByLabelText('Site URL')).toHaveValue(site().shareUrl);
      expect(screen.getByRole('link', { name: /edit in chat/i })).toHaveAttribute(
        'href',
        '/chat/11111111-1111-4111-8111-111111111111?artifact=artifact-1',
      );
      expect(mocks.readPublishedSite).toHaveBeenCalledTimes(1);
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toMatchObject({
        token: TOKEN,
        visibility: 'public',
      });
    },
  );

  it.each(['rename', 'sharing'] as const)(
    'does not apply a failed %s after the other setting succeeds',
    async (failed) => {
      const rename = deferredUpdate();
      const sharing = deferredUpdate();
      mocks.readPublishedSite.mockResolvedValue({
        site: site({ visibility: 'invited' }),
        workspace: null,
      });
      mocks.updatePublishedSite.mockImplementation((_token: string, change: { title?: string }) =>
        change.title === undefined ? sharing.promise : rename.promise,
      );
      render(<SiteDetail token={TOKEN} />);
      fireEvent.change(await screen.findByLabelText('Site name'), {
        target: { value: 'Office league' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      fireEvent.click(screen.getByRole('radio', { name: /anyone with the link/i }));
      expect(mocks.updatePublishedSite).toHaveBeenCalledTimes(2);

      const pending = { rename, sharing };
      const succeeded = failed === 'rename' ? 'sharing' : 'rename';
      await act(async () =>
        pending[succeeded].resolve({
          token: TOKEN,
          title: succeeded === 'rename' ? 'Office league' : 'Team scoreboard',
          visibility: succeeded === 'sharing' ? 'public' : 'invited',
          shareUrl: site().shareUrl,
          organizationId: null,
          updatedAt: '2026-10-10T00:00:00.000Z',
        }),
      );
      await act(async () => pending[failed].reject(new Error('Update refused')));

      expect(screen.getByRole('alert')).toHaveTextContent('Update refused');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        failed === 'rename' ? 'Team scoreboard' : 'Office league',
      );
      expect(screen.getByRole('radio', { name: /anyone with the link/i })).toHaveAttribute(
        'aria-checked',
        failed === 'rename' ? 'true' : 'false',
      );
      expect(screen.getByLabelText('Site URL')).toHaveValue(site().shareUrl);
    },
  );

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
    mocks.readPublishedSite.mockResolvedValue({ site: site(), workspace: { memberCount: 3 } });
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
        expect.objectContaining({
          assertCurrent: expect.any(Function),
          fetch: expect.any(Function),
        }),
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
    expect(mocks.readPublishedSiteData).toHaveBeenCalledWith(
      TOKEN,
      expect.any(AbortSignal),
      expect.objectContaining({ assertCurrent: expect.any(Function), fetch: expect.any(Function) }),
    );
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

    await waitFor(() =>
      expect(mocks.clearPublishedSiteSharedData).toHaveBeenCalledWith(
        TOKEN,
        expect.objectContaining({
          assertCurrent: expect.any(Function),
          fetch: expect.any(Function),
        }),
      ),
    );
    expect(await screen.findByText('Nothing shared yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear shared data' })).toBeDisabled();
  });

  it('says a page that runs no script keeps no data', async () => {
    mocks.readPublishedSite.mockResolvedValue({
      site: site({ kind: 'markdown', sandboxed: false }),
      workspace: null,
    });
    mocks.readPublishedSiteData.mockResolvedValue(data({ supported: false }));

    render(<SiteDetail token={TOKEN} />);
    await openDataTab();

    expect(await screen.findByTestId('site-data-unsupported')).toHaveTextContent(
      'Only apps built as HTML or React can save data between visits.',
    );
  });
});

type SiteDetailResponse = Awaited<ReturnType<SitesServiceModule['readPublishedSite']>>;

async function restoreOlderVersion() {
  const versions = await screen.findAllByTestId('site-version');
  fireEvent.click(within(versions[1]!).getByRole('button', { name: 'Restore' }));
}

function updateReceipt(overrides: Partial<UpdateResponse> = {}): UpdateResponse {
  return {
    token: TOKEN,
    title: 'Team scoreboard',
    visibility: 'public',
    shareUrl: site().shareUrl,
    organizationId: null,
    updatedAt: '2026-10-10T00:00:00.000Z',
    ...overrides,
  };
}

// Mounted controls and the real useSiteActions hook, with service promises controlled here.
describe('SiteDetail read ownership', () => {
  it.each(['success', 'error'] as const)(
    'retires the post-restore GET after sharing succeeds, ignoring its late %s',
    async (outcome) => {
      const restored = deferred<void>();
      const oldRead = deferred<SiteDetailResponse>();
      const freshRead = deferred<SiteDetailResponse>();
      const sharing = deferredUpdate();
      mocks.readPublishedSite
        .mockResolvedValueOnce({ site: site({ visibility: 'invited' }), workspace: null })
        .mockReturnValueOnce(oldRead.promise)
        .mockReturnValueOnce(freshRead.promise);
      mocks.republishArtifactVersion.mockReturnValueOnce(restored.promise);
      mocks.updatePublishedSite.mockReturnValueOnce(sharing.promise);
      render(<SiteDetail token={TOKEN} />);
      await restoreOlderVersion();
      expect(mocks.readPublishedSite).toHaveBeenCalledTimes(1);
      await act(async () => restored.resolve());
      expect(mocks.readPublishedSite).toHaveBeenCalledTimes(2);
      const oldSignal = mocks.readPublishedSite.mock.calls[1]![1] as AbortSignal;
      expect(oldSignal.aborted).toBe(false);
      expect(screen.getByRole('radio', { name: /anyone with the link/i })).toBeEnabled();
      fireEvent.click(screen.getByRole('radio', { name: /anyone with the link/i }));
      await act(async () => sharing.resolve(updateReceipt()));
      expect(oldSignal.aborted).toBe(true);
      expect(mocks.readPublishedSite).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId('site-visibility')).toHaveTextContent('Public');
      await act(async () => {
        if (outcome === 'success') {
          oldRead.resolve({ site: site({ visibility: 'invited' }), workspace: null });
        } else oldRead.reject(new Error('Retired list failure'));
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByTestId('site-visibility')).toHaveTextContent('Public');
      expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.visibility).toBe(
        'public',
      );
      await act(async () => freshRead.resolve({ site: site(), workspace: null }));
      expect(mocks.readPublishedSite).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId('site-visibility')).toHaveTextContent('Public');
    },
  );

  it('replaces each pending reread once for independent name and sharing receipts', async () => {
    const reads = [
      deferred<SiteDetailResponse>(),
      deferred<SiteDetailResponse>(),
      deferred<SiteDetailResponse>(),
    ];
    const rename = deferredUpdate();
    const sharing = deferredUpdate();
    mocks.readPublishedSite
      .mockResolvedValueOnce({ site: site({ visibility: 'invited' }), workspace: null })
      .mockReturnValueOnce(reads[0]!.promise)
      .mockReturnValueOnce(reads[1]!.promise)
      .mockReturnValueOnce(reads[2]!.promise);
    mocks.updatePublishedSite.mockImplementation((_token: string, change: { title?: string }) =>
      change.title === undefined ? sharing.promise : rename.promise,
    );
    render(<SiteDetail token={TOKEN} />);
    await restoreOlderVersion();
    await waitFor(() => expect(mocks.readPublishedSite).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText('Site name'), { target: { value: 'Office league' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('radio', { name: /anyone with the link/i }));
    await act(async () =>
      rename.resolve(updateReceipt({ title: 'Office league', visibility: 'invited' })),
    );
    expect(mocks.readPublishedSite).toHaveBeenCalledTimes(3);
    await act(async () => sharing.resolve(updateReceipt()));
    expect(mocks.readPublishedSite).toHaveBeenCalledTimes(4);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Office league');
    expect(screen.getByTestId('site-visibility')).toHaveTextContent('Public');
    expect((mocks.readPublishedSite.mock.calls[1]![1] as AbortSignal).aborted).toBe(true);
    expect((mocks.readPublishedSite.mock.calls[2]![1] as AbortSignal).aborted).toBe(true);
    await act(async () => {
      reads[0]!.resolve({ site: site({ visibility: 'invited' }), workspace: null });
      reads[1]!.reject(new Error('Retired reread'));
      reads[2]!.resolve({ site: site({ title: 'Office league' }), workspace: null });
    });
    expect(mocks.readPublishedSite).toHaveBeenCalledTimes(4);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Office league');
  });

  it.each([new Error('Current read failed'), new DOMException('Unexpected abort', 'AbortError')])(
    'exposes a current read failure without an automatic loop, then allows manual retry: %s',
    async (error) => {
      const failed = deferred<SiteDetailResponse>();
      const retry = deferred<SiteDetailResponse>();
      mocks.readPublishedSite
        .mockReturnValueOnce(failed.promise)
        .mockReturnValueOnce(retry.promise);
      render(<SiteDetail token={TOKEN} />);
      await act(async () => failed.reject(error));
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mocks.readPublishedSite).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(mocks.readPublishedSite).toHaveBeenCalledTimes(2);
      expect(mocks.readPublishedSite.mock.calls[1]![1]).toBeInstanceOf(AbortSignal);
      await act(async () => retry.resolve({ site: site(), workspace: null }));
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Team scoreboard');
      expect(mocks.readPublishedSite).toHaveBeenCalledTimes(2);
    },
  );

  it('uses the complete restored site and workspace without replacing unrelated cache records', async () => {
    const oldRead = deferred<SiteDetailResponse>();
    const freshRead = deferred<SiteDetailResponse>();
    const renewed = site({
      title: 'Restored scoreboard',
      version: 3,
      kind: 'html',
      language: 'html',
      contentChars: 4321,
      sandboxed: false,
      conversationId: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-10-11T00:00:00.000Z',
    });
    const other = site({ token: 'bbbbbbbbbbbbbbbbbbbbbbbb', artifactId: 'artifact-2' });
    usePublishedSitesStore.getState().record(other.artifactId, other, capturePublicationLease()!);
    mocks.readPublishedSite
      .mockResolvedValueOnce({ site: site({ visibility: 'invited' }), workspace: null })
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(freshRead.promise);
    mocks.updatePublishedSite.mockResolvedValue(updateReceipt());
    render(<SiteDetail token={TOKEN} />);
    await restoreOlderVersion();
    await waitFor(() => expect(mocks.readPublishedSite).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('radio', { name: /anyone with the link/i }));
    await waitFor(() => expect(mocks.readPublishedSite).toHaveBeenCalledTimes(3));
    await act(async () => freshRead.resolve({ site: renewed, workspace: { memberCount: 7 } }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(renewed.title);
    expect(screen.getByRole('radio', { name: /your workspace/i })).toBeEnabled();
    expect(screen.getByRole('link', { name: /edit in chat/i })).toHaveAttribute(
      'href',
      `/chat/${renewed.conversationId}?artifact=artifact-1`,
    );
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-2']?.token).toBe(other.token);
    await restoreOlderVersion();
    await waitFor(() =>
      expect(mocks.republishArtifactVersion).toHaveBeenLastCalledWith(
        renewed,
        1,
        expect.objectContaining({
          assertCurrent: expect.any(Function),
          fetch: expect.any(Function),
        }),
      ),
    );
    await act(async () =>
      oldRead.resolve({ site: site({ visibility: 'invited' }), workspace: null }),
    );
  });

  it('retires the post-restore read before navigating after successful unpublish', async () => {
    const oldRead = deferred<SiteDetailResponse>();
    mocks.readPublishedSite
      .mockResolvedValueOnce({ site: site(), workspace: null })
      .mockReturnValueOnce(oldRead.promise);
    mocks.push.mockImplementation(() => {
      expect((mocks.readPublishedSite.mock.calls[1]![1] as AbortSignal).aborted).toBe(true);
    });
    render(<SiteDetail token={TOKEN} />);
    await restoreOlderVersion();
    await waitFor(() => expect(mocks.readPublishedSite).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByTestId('site-unpublish'));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Unpublish' }),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/chat/sites'));
    await act(async () => oldRead.resolve({ site: site(), workspace: null }));
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']).toBeUndefined();
    expect(screen.queryByLabelText('Site name')).not.toBeInTheDocument();
    expect(mocks.readPublishedSite).toHaveBeenCalledTimes(2);
  });

  it.each(['success', 'error'] as const)(
    'ignores an initial read settled after unmount: %s',
    async (outcome) => {
      const pending = deferred<SiteDetailResponse>();
      mocks.readPublishedSite.mockReturnValueOnce(pending.promise);
      const view = render(<SiteDetail token={TOKEN} />);
      const signal = mocks.readPublishedSite.mock.calls[0]![1] as AbortSignal;
      view.unmount();
      expect(signal.aborted).toBe(true);
      await act(async () => {
        if (outcome === 'success') pending.resolve({ site: site(), workspace: null });
        else pending.reject(new Error('Unmounted read'));
      });
      expect(usePublishedSitesStore.getState().byArtifactId).toEqual({});
      expect(mocks.readPublishedSite).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps A → B → A lifetimes separate even when both older reads settle late', async () => {
    const firstA = deferred<SiteDetailResponse>();
    const readB = deferred<SiteDetailResponse>();
    const currentA = deferred<SiteDetailResponse>();
    mocks.readPublishedSite
      .mockReturnValueOnce(firstA.promise)
      .mockReturnValueOnce(readB.promise)
      .mockReturnValueOnce(currentA.promise);
    const view = render(<SiteDetail token={TOKEN} />);
    view.rerender(<SiteDetail token="bbbbbbbbbbbbbbbbbbbbbbbb" />);
    view.rerender(<SiteDetail token={TOKEN} />);
    await act(async () =>
      currentA.resolve({ site: site({ title: 'Current A' }), workspace: null }),
    );
    await act(async () => {
      firstA.resolve({ site: site({ title: 'Old A', visibility: 'invited' }), workspace: null });
      readB.reject(new Error('Old B'));
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Current A');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.visibility).toBe('public');
    expect(mocks.readPublishedSite).toHaveBeenCalledTimes(3);
  });

  it('does not start a read when an old restore POST completes after token replacement', async () => {
    const restored = deferred<void>();
    const tokenB = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    mocks.readPublishedSite
      .mockResolvedValueOnce({ site: site(), workspace: null })
      .mockResolvedValueOnce({
        site: site({ token: tokenB, title: 'Current B' }),
        workspace: null,
      });
    mocks.republishArtifactVersion.mockReturnValueOnce(restored.promise);
    const view = render(<SiteDetail token={TOKEN} />);
    await restoreOlderVersion();
    view.rerender(<SiteDetail token={tokenB} />);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Current B');
    await act(async () => restored.resolve());
    expect(mocks.readPublishedSite).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Current B');
  });
});

describe('SiteDetail callback boundary models', () => {
  it('ignores mismatched token and artifact receipts without interrupting a current refresh', async () => {
    const pending = deferred<SiteDetailResponse>();
    mocks.readPublishedSite
      .mockResolvedValueOnce({ site: site(), workspace: null })
      .mockReturnValueOnce(pending.promise);
    render(<SiteDetail token={TOKEN} />);
    await restoreOlderVersion();
    await waitFor(() => expect(mocks.readPublishedSite).toHaveBeenCalledTimes(2));
    const { onUpdated } = mocks.observeActions.mock.lastCall![0] as Parameters<
      SiteActionsModule['useSiteActions']
    >[0];
    act(() => {
      onUpdated({
        token: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        artifactId: 'artifact-1',
        changes: { title: 'Wrong token', updatedAt: site().updatedAt },
      });
      onUpdated({
        token: TOKEN,
        artifactId: 'wrong-artifact',
        changes: { title: 'Wrong artifact', updatedAt: site().updatedAt },
      });
    });
    expect((mocks.readPublishedSite.mock.calls[1]![1] as AbortSignal).aborted).toBe(false);
    expect(mocks.readPublishedSite).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Team scoreboard');
    await act(async () =>
      pending.resolve({ site: site({ title: 'Restored title' }), workspace: null }),
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Restored title');
  });

  it('ignores captured update and unpublish callbacks from the first A after A → B → A', async () => {
    const view = render(<SiteDetail token={TOKEN} />);
    await screen.findByLabelText('Site name');
    const old = mocks.observeActions.mock.lastCall![0] as Parameters<
      SiteActionsModule['useSiteActions']
    >[0];
    mocks.readPublishedSite.mockResolvedValueOnce(null);
    view.rerender(<SiteDetail token="bbbbbbbbbbbbbbbbbbbbbbbb" />);
    await screen.findByTestId('site-missing');
    mocks.readPublishedSite.mockResolvedValueOnce({
      site: site({ title: 'Current A' }),
      workspace: null,
    });
    view.rerender(<SiteDetail token={TOKEN} />);
    await screen.findByLabelText('Site name');
    act(() => {
      old.onUpdated({
        token: TOKEN,
        artifactId: 'artifact-1',
        changes: { title: 'Old A', updatedAt: site().updatedAt },
      });
      old.onUnpublished(site());
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Current A');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.readPublishedSite).toHaveBeenCalledTimes(3);
  });
});

describe('SiteDetail refresh recovery', () => {
  it('keeps successful sharing visible after a replacement read fails and waits for manual retry', async () => {
    const oldRead = deferred<SiteDetailResponse>();
    const replacement = deferred<SiteDetailResponse>();
    const retry = deferred<SiteDetailResponse>();
    mocks.readPublishedSite
      .mockResolvedValueOnce({ site: site({ visibility: 'invited' }), workspace: null })
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(replacement.promise)
      .mockReturnValueOnce(retry.promise);
    mocks.updatePublishedSite.mockResolvedValue(updateReceipt());
    render(<SiteDetail token={TOKEN} />);
    await restoreOlderVersion();
    await waitFor(() => expect(mocks.readPublishedSite).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('radio', { name: /anyone with the link/i }));
    await waitFor(() => expect(mocks.readPublishedSite).toHaveBeenCalledTimes(3));
    fireEvent.change(screen.getByLabelText('Site name'), {
      target: { value: 'Unsaved name draft' },
    });
    await act(async () => replacement.reject(new Error('Refresh unavailable')));
    expect(screen.getByLabelText('Site name')).toHaveValue('Unsaved name draft');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /only people you invite/i })).toBeEnabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be refreshed/i);
    expect(screen.getByTestId('site-visibility')).toHaveTextContent('Public');
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.visibility).toBe('public');
    expect(mocks.readPublishedSite).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.readPublishedSite).toHaveBeenCalledTimes(4);
    expect(screen.getByText('Loading site…')).toBeInTheDocument();
    await act(async () => {
      oldRead.resolve({ site: site({ visibility: 'invited' }), workspace: null });
      retry.resolve({ site: site({ version: 3 }), workspace: { memberCount: 4 } });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('site-visibility')).toHaveTextContent('Public');
    expect(screen.getByRole('radio', { name: /your workspace/i })).toBeEnabled();
    expect(mocks.readPublishedSite).toHaveBeenCalledTimes(4);
  });
});

describe('SiteDetail committed read lifetime models', () => {
  it('rejects the first StrictMode setup read after effect cleanup and replay', async () => {
    const retired = deferred<SiteDetailResponse>();
    const current = deferred<SiteDetailResponse>();
    mocks.readPublishedSite
      .mockReturnValueOnce(retired.promise)
      .mockReturnValueOnce(current.promise);
    render(
      <StrictMode>
        <SiteDetail token={TOKEN} />
      </StrictMode>,
    );
    expect(mocks.readPublishedSite).toHaveBeenCalledTimes(2);
    expect((mocks.readPublishedSite.mock.calls[0]![1] as AbortSignal).aborted).toBe(true);
    await act(async () =>
      current.resolve({ site: site({ title: 'Current setup' }), workspace: null }),
    );
    await act(async () =>
      retired.resolve({
        site: site({ title: 'Retired setup', visibility: 'invited' }),
        workspace: null,
      }),
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Current setup');
    expect(usePublishedSitesStore.getState().byArtifactId['artifact-1']?.visibility).toBe('public');
    expect(mocks.readPublishedSite).toHaveBeenCalledTimes(2);
  });

  it('rechecks read ownership after a synchronous cache subscriber delivers a receipt', async () => {
    const oldRead = deferred<SiteDetailResponse>();
    const freshRead = deferred<SiteDetailResponse>();
    mocks.readPublishedSite
      .mockResolvedValueOnce({ site: site(), workspace: null })
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(freshRead.promise);
    render(<SiteDetail token={TOKEN} />);
    await restoreOlderVersion();
    await waitFor(() => expect(mocks.readPublishedSite).toHaveBeenCalledTimes(2));
    const { onUpdated } = mocks.observeActions.mock.lastCall![0] as Parameters<
      SiteActionsModule['useSiteActions']
    >[0];
    let delivered = false;
    const unsubscribe = usePublishedSitesStore.subscribe(() => {
      if (delivered) return;
      delivered = true;
      onUpdated({
        token: TOKEN,
        artifactId: 'artifact-1',
        changes: { title: 'Receipt title', updatedAt: '2026-10-12T00:00:00.000Z' },
      });
    });
    try {
      await act(async () =>
        oldRead.resolve({ site: site({ title: 'Superseded snapshot' }), workspace: null }),
      );
      expect(delivered).toBe(true);
      expect(mocks.readPublishedSite).toHaveBeenCalledTimes(3);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Receipt title');
    } finally {
      unsubscribe();
      await act(async () =>
        freshRead.resolve({ site: site({ title: 'Receipt title' }), workspace: null }),
      );
    }
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Receipt title');
    expect(mocks.readPublishedSite).toHaveBeenCalledTimes(3);
  });
});

describe('SiteDetail common cleanup ownership models', () => {
  it('retires a mounted initial read across cleanup and release', async () => {
    const oldRead = deferred<SiteDetailResponse>();
    const newRead = deferred<SiteDetailResponse>();
    mocks.readPublishedSite
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(newRead.promise);
    render(<SiteDetail token={TOKEN} />);
    const signal = mocks.readPublishedSite.mock.calls[0]![1] as AbortSignal;
    let finish = () => {};
    try {
      act(() => {
        finish = beginPublicationCleanup();
      });
      expect(signal.aborted).toBe(true);
      expect(usePublishedSitesStore.getState().lease).toBeNull();
      act(() => finish());
      await act(async () =>
        oldRead.resolve({ site: site({ title: 'Retired title' }), workspace: null }),
      );
      expect(screen.queryByText('Retired title')).not.toBeInTheDocument();
      expect(usePublishedSitesStore.getState().byArtifactId).toEqual({});
      await act(async () =>
        newRead.resolve({ site: site({ title: 'Replacement title' }), workspace: null }),
      );
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Replacement title');
    } finally {
      cleanup();
      finish();
      await act(async () => {
        oldRead.resolve(null);
        newRead.resolve(null);
      });
    }
  });

  it.each([
    ['name', 'success'],
    ['name', 'error'],
    ['sharing', 'success'],
    ['sharing', 'error'],
  ] as const)(
    'suppresses stale %s %s receipt and feedback after cleanup',
    async (kind, outcome) => {
      const pending = deferredUpdate();
      mocks.readPublishedSite.mockResolvedValue({
        site: site({ visibility: 'invited' }),
        workspace: null,
      });
      mocks.updatePublishedSite.mockReturnValueOnce(pending.promise);
      render(<SiteDetail token={TOKEN} />);
      await screen.findByLabelText('Site name');
      if (kind === 'name') {
        fireEvent.change(screen.getByLabelText('Site name'), {
          target: { value: 'Retired rename' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      } else fireEvent.click(screen.getByRole('radio', { name: /anyone with the link/i }));
      expect(mocks.updatePublishedSite).toHaveBeenCalledTimes(1);
      mocks.toastSuccess.mockClear();
      let finish = () => {};
      try {
        act(() => {
          finish = beginPublicationCleanup();
        });
        await act(async () => {
          if (outcome === 'success') pending.resolve(updateReceipt({ title: 'Retired rename' }));
          else pending.reject(new Error('Retired settings failure'));
        });
        expect(usePublishedSitesStore.getState().byArtifactId).toEqual({});
        expect(mocks.toastSuccess).not.toHaveBeenCalled();
        expect(mocks.toastError).not.toHaveBeenCalled();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      } finally {
        cleanup();
        finish();
        await act(async () => pending.resolve(updateReceipt()));
      }
    },
  );

  it('does not navigate or report success for an unpublish receipt after cleanup', async () => {
    const pending = deferred<void>();
    mocks.unpublishArtifact.mockReturnValueOnce(pending.promise);
    render(<SiteDetail token={TOKEN} />);
    fireEvent.click(await screen.findByTestId('site-unpublish'));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Unpublish' }),
    );
    expect(mocks.unpublishArtifact).toHaveBeenCalledTimes(1);
    let finish = () => {};
    try {
      act(() => {
        finish = beginPublicationCleanup();
      });
      await act(async () => pending.resolve());
      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.toastSuccess).not.toHaveBeenCalled();
      expect(usePublishedSitesStore.getState().byArtifactId).toEqual({});
    } finally {
      cleanup();
      finish();
      await act(async () => pending.resolve());
    }
  });

  it('removes an offered unpublish confirmation on cleanup without sending its request', async () => {
    render(<SiteDetail token={TOKEN} />);
    fireEvent.click(await screen.findByTestId('site-unpublish'));
    const confirm = within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Unpublish',
    });
    let finish = () => {};
    try {
      act(() => {
        finish = beginPublicationCleanup();
      });
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      fireEvent.click(confirm);
      expect(mocks.unpublishArtifact).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
    } finally {
      cleanup();
      finish();
    }
  });
});
