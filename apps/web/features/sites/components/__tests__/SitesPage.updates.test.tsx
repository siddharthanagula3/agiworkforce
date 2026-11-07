import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiteUpdate } from '../../hooks/useSiteActions';
import type { PublishedSite } from '../../services/sites-service';

type ActionsModule = typeof import('../../hooks/useSiteActions');
type ServiceModule = typeof import('../../services/sites-service');
type CardModule = typeof import('../SiteCard');

const mocks = vi.hoisted(() => ({
  listPublishedSitesPage: vi.fn(),
  onUpdated: undefined as ((update: SiteUpdate) => void) | undefined,
}));

vi.mock('../../services/sites-service', async (importOriginal) => ({
  ...(await importOriginal<ServiceModule>()),
  listPublishedSitesPage: (...args: unknown[]) => mocks.listPublishedSitesPage(...args),
}));

// This is the consumer callback boundary, not simultaneous modal interaction.
vi.mock('../../hooks/useSiteActions', async (importOriginal) => {
  const actual = await importOriginal<ActionsModule>();
  return {
    ...actual,
    useSiteActions: (options: Parameters<ActionsModule['useSiteActions']>[0]) => {
      mocks.onUpdated = options.onUpdated;
      return actual.useSiteActions(options);
    },
  };
});

vi.mock('../SiteCard', async (importOriginal) => ({
  ...(await importOriginal<CardModule>()),
  SiteCard: ({ site }: { site: PublishedSite }) => (
    <li data-testid="site-record">{JSON.stringify(site)}</li>
  ),
}));

const { SitesPage } = await import('../SitesPage');
const { mergeSiteUpdate } = await import('../../hooks/useSiteActions');
const { beginPublicationCleanup } = await import('../../stores/published-sites-store');

const original: PublishedSite = {
  token: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  artifactId: 'artifact-1',
  conversationId: '11111111-1111-4111-8111-111111111111',
  title: 'Team scoreboard',
  kind: 'react',
  language: null,
  contentChars: 120,
  version: 2,
  visibility: 'invited',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-09T00:00:00.000Z',
  shareUrl: 'https://agiworkforce.com/shared-artifact/aaaaaaaaaaaaaaaaaaaaaaaa',
  sandboxed: true,
};
const rename: SiteUpdate = {
  token: original.token,
  artifactId: original.artifactId,
  changes: { title: 'Office league', updatedAt: '2026-10-10T00:00:00.000Z' },
};
const sharing: SiteUpdate = {
  token: original.token,
  artifactId: original.artifactId,
  changes: {
    visibility: 'public',
    shareUrl: `${original.shareUrl}?view=public`,
    updatedAt: '2026-10-10T00:00:01.000Z',
  },
};

function emit(update: SiteUpdate) {
  expect(mocks.onUpdated).toBeTypeOf('function');
  act(() => mocks.onUpdated!(update));
}

function readRecord() {
  return JSON.parse(screen.getByTestId('site-record').textContent!);
}

beforeEach(() => {
  mocks.onUpdated = undefined;
  beginPublicationCleanup()();
  mocks.listPublishedSitesPage.mockResolvedValue({ sites: [{ ...original }], workspace: null, nextCursor: null });
});

afterEach(() => {
  cleanup();
  beginPublicationCleanup()();
});

describe('SitesPage update callback boundary', () => {
  it.each(['sharing', 'rename'] as const)(
    'merges both field patches when %s arrives first without replacing other fields',
    async (first) => {
      render(<SitesPage />);
      await screen.findByTestId('site-record');
      emit(first === 'sharing' ? sharing : rename);
      emit(first === 'sharing' ? rename : sharing);
      expect(readRecord()).toEqual({
        ...original,
        ...rename.changes,
        ...sharing.changes,
      });
    },
  );

  it.each([
    { token: 'bbbbbbbbbbbbbbbbbbbbbbbb', artifactId: original.artifactId },
    { token: original.token, artifactId: 'artifact-2' },
  ])('ignores a patch with unmatched identity %j', async (identity) => {
    render(<SitesPage />);
    await screen.findByTestId('site-record');
    emit({ ...rename, ...identity });
    expect(readRecord()).toEqual(original);
    expect(screen.getAllByTestId('site-record')).toHaveLength(1);
  });

  it('does not insert a site into a ready empty list', async () => {
    mocks.listPublishedSitesPage.mockResolvedValue({ sites: [], workspace: null, nextCursor: null });
    render(<SitesPage />);
    await screen.findByTestId('sites-empty');
    emit(rename);
    expect(screen.getByTestId('sites-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('site-record')).toBeNull();
  });

  it('retires a loading refresh when an exact current-row mutation completes', async () => {
    let finish!: (value: { sites: PublishedSite[]; workspace: null; nextCursor: null }) => void;
    const refresh = new Promise<{ sites: PublishedSite[]; workspace: null; nextCursor: null }>((resolve) => {
      finish = resolve;
    });
    render(<SitesPage />);
    await screen.findByTestId('site-record');
    mocks.listPublishedSitesPage.mockReturnValueOnce(refresh);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sites' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading your sites');
    expect(readRecord()).toEqual(original);
    const signal = mocks.listPublishedSitesPage.mock.lastCall![1] as AbortSignal;
    emit(rename);
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole('status')).toBeNull();
    expect(readRecord()).toEqual({ ...original, ...rename.changes });
    await act(async () => finish({ sites: [], workspace: null, nextCursor: null }));
    expect(readRecord()).toEqual({ ...original, ...rename.changes });
  });

  it('leaves an error state intact', async () => {
    mocks.listPublishedSitesPage.mockRejectedValueOnce(new Error('List unavailable'));
    render(<SitesPage />);
    await screen.findByRole('alert');
    emit(sharing);
    expect(screen.getByRole('alert')).toHaveTextContent('List unavailable');
    expect(screen.queryByTestId('site-record')).toBeNull();
  });

  it('keeps a later-page mutation ahead of an interrupted newest refresh without accepting an off-page callback', async () => {
    const older = { ...original, token: 'b'.repeat(24), artifactId: 'artifact-2', title: 'Older site', shareUrl: `https://agiworkforce.com/shared-artifact/${'b'.repeat(24)}` };
    let finish!: (value: { sites: PublishedSite[]; workspace: null; nextCursor: string | null }) => void;
    const refresh = new Promise<{ sites: PublishedSite[]; workspace: null; nextCursor: string | null }>((resolve) => { finish = resolve; });
    mocks.listPublishedSitesPage
      .mockResolvedValueOnce({ sites: [original], workspace: null, nextCursor: 'older-cursor' })
      .mockResolvedValueOnce({ sites: [older], workspace: null, nextCursor: null })
      .mockReturnValueOnce(refresh);
    render(<SitesPage />);
    await screen.findByTestId('site-record');
    const originalPageCallback = mocks.onUpdated!;
    fireEvent.click(screen.getByRole('button', { name: 'Older', exact: true }));
    await screen.findByText(/Older site/);
    expect(readRecord()).toEqual(older);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh sites' }));
    const signal = mocks.listPublishedSitesPage.mock.lastCall![1] as AbortSignal;
    act(() => originalPageCallback(rename));
    expect(signal.aborted).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your sites');
    expect(readRecord()).toEqual(older);
    const update = { ...rename, token: older.token, artifactId: older.artifactId };
    emit(update);
    expect(signal.aborted).toBe(true);
    expect(readRecord()).toEqual({ ...older, ...rename.changes });
    await act(async () => finish({ sites: [original], workspace: null, nextCursor: 'older-cursor' }));
    expect(readRecord()).toEqual({ ...older, ...rename.changes });
    expect(screen.getByRole('button', { name: 'Back to newest' })).toBeEnabled();
    expect(mocks.listPublishedSitesPage.mock.calls.map(([cursor]) => cursor)).toEqual([null, 'older-cursor', null]);
  });
});

describe('site update metadata composition', () => {
  it.each([
    ['2026-10-11T00:00:00.000Z', '2026-10-10T00:00:00.000Z', '2026-10-11T00:00:00.000Z'],
    ['2026-10-09T00:00:00.000Z', '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z'],
    ['2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z'],
    ['2026-10-09T00:00:00.000Z', 'invalid', '2026-10-09T00:00:00.000Z'],
    ['invalid', '2026-10-10T00:00:00.000Z', '2026-10-10T00:00:00.000Z'],
    ['invalid', 'also invalid', 'also invalid'],
  ])('composes current %s and incoming %s metadata', (current, incoming, expected) => {
    const record = { ...original, updatedAt: current };
    const update = { ...rename, changes: { ...rename.changes, updatedAt: incoming } };
    expect(mergeSiteUpdate(record, update)).toEqual({
      ...record,
      title: 'Office league',
      updatedAt: expected,
    });
    expect(record.title).toBe(original.title);
    expect(record.updatedAt).toBe(current);
  });
});
