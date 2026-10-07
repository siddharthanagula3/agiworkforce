import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import WaitlistPanel from './WaitlistPanel';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

const ADA = {
  id: 'entry-ada',
  email: 'ada@example.invalid',
  source: 'mobile',
  joinedAt: '2026-10-03T09:00:00.000Z',
  consent: [
    {
      purpose: 'platform_availability_waitlist',
      granted: true,
      recordedAt: '2026-10-03T09:00:00.000Z',
      noticeVersion: '2026-08-11',
      surface: 'web-waitlist-modal',
    },
    {
      purpose: 'product_updates',
      granted: false,
      recordedAt: '2026-10-03T09:00:00.000Z',
      noticeVersion: '2026-08-11',
      surface: 'web-waitlist-modal',
    },
  ],
};

const GRACE = {
  id: 'entry-grace',
  email: 'grace@example.invalid',
  source: 'website',
  joinedAt: '2026-10-01T09:00:00.000Z',
  consent: [],
};

function publicPage(overrides: Record<string, unknown> = {}) {
  return {
    list: 'public',
    total: 2,
    hasMore: false,
    nextCursor: null,
    bySource: [
      { key: 'mobile', count: 1 },
      { key: 'website', count: 1 },
    ],
    exportRowLimit: 10_000,
    entries: [ADA, GRACE],
    ...overrides,
  };
}

function upgradePage(overrides: Record<string, unknown> = {}) {
  return {
    list: 'upgrade',
    total: 1,
    hasMore: false,
    nextCursor: null,
    byPlan: [{ key: 'pro', count: 1 }],
    entries: [
      { id: 'upgrade-1', userId: 'user_upgrade_1', plan: 'pro', joinedAt: '2026-10-02T09:00:00Z' },
    ],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

const UNDER_BODY_SIZE = /(^|\s)text-(xs|\[1[0-3]px\])(\s|$)/;

function textUnderBodySize(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[class]'))
    .map((element) => element.getAttribute('class') ?? '')
    .filter((classes) => UNDER_BODY_SIZE.test(classes));
}

function respondWith(pages: { public: unknown[]; upgrade?: unknown[] }) {
  const queues = { public: [...pages.public], upgrade: [...(pages.upgrade ?? [upgradePage()])] };
  return async (url: string) => {
    const list = new URL(url, 'https://app.agiworkforce.test').searchParams.get('list');
    return jsonResponse((list === 'upgrade' ? queues.upgrade : queues.public).shift());
  };
}

describe('WaitlistPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('says it is reading the lists before the requests settle', () => {
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    render(<WaitlistPanel />);

    expect(screen.getByText('Reading the waitlist…')).toBeInTheDocument();
    expect(screen.getByText('Reading the upgrade waitlist…')).toBeInTheDocument();
  });

  it('lists each address with its source, the totals and the consent on record', async () => {
    mocks.fetch.mockImplementation(respondWith({ public: [publicPage()] }));
    render(<WaitlistPanel />);

    const ada = (await screen.findByText(ADA.email)).closest('tr')!;
    expect(within(ada).getByText('mobile')).toBeInTheDocument();
    expect(within(ada).getByText('platform_availability_waitlist').closest('li')).toHaveTextContent(
      'granted',
    );
    expect(within(ada).getByText('product_updates').closest('li')).toHaveTextContent('not granted');
    const grace = screen.getByText(GRACE.email).closest('tr')!;
    expect(within(grace).getByText('no decision on record for this list')).toBeInTheDocument();
    expect(screen.getByText(/by source, mobile: 1 · website: 1/)).toBeInTheDocument();
  });

  it('reads both lists uncached from the operator waitlist service', async () => {
    mocks.fetch.mockImplementation(respondWith({ public: [publicPage()] }));
    render(<WaitlistPanel />);
    await screen.findByText(ADA.email);

    expect(mocks.fetch.mock.calls.map((call: unknown[]) => call[0]).sort()).toEqual([
      '/api/admin/waitlist?list=public',
      '/api/admin/waitlist?list=upgrade',
    ]);
    for (const call of mocks.fetch.mock.calls) {
      expect(call[1]).toMatchObject({ cache: 'no-store' });
    }
  });

  it('shows the upgrade waitlist by account and plan', async () => {
    mocks.fetch.mockImplementation(respondWith({ public: [publicPage()] }));
    render(<WaitlistPanel />);

    const row = (await screen.findByText('user_upgrade_1')).closest('tr')!;
    expect(within(row).getByText('pro')).toBeInTheDocument();
  });

  it('links the export to the operator export service as a download', async () => {
    mocks.fetch.mockImplementation(respondWith({ public: [publicPage()] }));
    render(<WaitlistPanel />);

    const link = screen.getByRole('link', { name: 'Export CSV' });
    expect(link).toHaveAttribute('href', '/api/admin/waitlist/export');
    expect(link).toHaveAttribute('download');
  });

  it('names what would populate each list when it is empty', async () => {
    mocks.fetch.mockImplementation(
      respondWith({
        public: [publicPage({ total: 0, bySource: [], entries: [] })],
        upgrade: [upgradePage({ total: 0, byPlan: [], entries: [] })],
      }),
    );
    render(<WaitlistPanel />);

    expect(await screen.findByText(/Nobody has joined yet/)).toBeInTheDocument();
    expect(
      await screen.findByText(/No account has joined a paid plan waitlist/),
    ).toBeInTheDocument();
  });

  it('sets no line under the 14px body size, with rows on screen', async () => {
    mocks.fetch.mockImplementation(
      respondWith({ public: [publicPage({ total: 25, exportRowLimit: 10 })] }),
    );
    const { container } = render(<WaitlistPanel />);
    await screen.findByText(ADA.email);
    await screen.findByText('user_upgrade_1');
    await screen.findByText(/The export holds the newest/);

    expect(container.querySelectorAll('td').length).toBeGreaterThan(0);
    expect(textUnderBodySize(container)).toEqual([]);
  });

  it('sets no line under the 14px body size, with both lists empty', async () => {
    mocks.fetch.mockImplementation(
      respondWith({
        public: [publicPage({ total: 0, bySource: [], entries: [] })],
        upgrade: [upgradePage({ total: 0, byPlan: [], entries: [] })],
      }),
    );
    const { container } = render(<WaitlistPanel />);
    await screen.findByText(/Nobody has joined yet/);
    await screen.findByText(/No account has joined a paid plan waitlist/);

    expect(textUnderBodySize(container)).toEqual([]);
  });

  it('surfaces a refused or failed read as an alert and shows no rows', async () => {
    mocks.fetch.mockImplementation(async () =>
      jsonResponse({ error: { message: 'Not found.' } }, 404),
    );
    render(<WaitlistPanel />);

    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('treats an answer that is not the agreed shape as a failed read', async () => {
    mocks.fetch.mockImplementation(async () => jsonResponse({ entries: [ADA] }));
    render(<WaitlistPanel />);

    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent(
      'Could not load the waitlist.',
    );
    expect(screen.queryByText(ADA.email)).toBeNull();
  });

  it('loads the next page by cursor and keeps the rows it already has', async () => {
    mocks.fetch.mockImplementation(
      respondWith({
        public: [
          publicPage({ entries: [ADA], hasMore: true, nextCursor: 'cursor-1' }),
          publicPage({ entries: [GRACE] }),
        ],
      }),
    );
    render(<WaitlistPanel />);
    await screen.findByText(ADA.email);

    fireEvent.click(screen.getByRole('button', { name: 'Load more entries' }));

    expect(await screen.findByText(GRACE.email)).toBeInTheDocument();
    expect(screen.getByText(ADA.email)).toBeInTheDocument();
    expect(mocks.fetch.mock.calls.map((call: unknown[]) => call[0])).toContain(
      '/api/admin/waitlist?list=public&cursor=cursor-1',
    );
    expect(screen.queryByRole('button', { name: 'Load more entries' })).toBeNull();
  });

  it('says when the export cannot hold every entry', async () => {
    mocks.fetch.mockImplementation(
      respondWith({ public: [publicPage({ total: 25, exportRowLimit: 10 })] }),
    );
    render(<WaitlistPanel />);

    expect(
      await screen.findByText(/The export holds the newest 10 of 25 entries/),
    ).toBeInTheDocument();
  });
});
