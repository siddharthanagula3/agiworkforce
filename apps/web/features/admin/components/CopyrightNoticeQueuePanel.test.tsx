import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CopyrightNoticeQueuePanel from './CopyrightNoticeQueuePanel';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  addCsrfHeaders: async (headers: Record<string, string>) => headers,
}));

function respondWith(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        ({
          ok: status >= 200 && status < 300,
          status,
          json: async () => body,
        }) as unknown as Response,
    ),
  );
}

describe('CopyrightNoticeQueuePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the load error instead of crashing when a response carries no notice list', async () => {
    respondWith({});

    render(<CopyrightNoticeQueuePanel />);

    expect(await screen.findByText('Notices could not be loaded.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Rights notices' })).toBeNull();
  });

  it('shows the empty queue when the list is empty', async () => {
    respondWith({ notices: [] });

    render(<CopyrightNoticeQueuePanel />);

    expect(await screen.findByText('No notice is waiting for a decision.')).toBeTruthy();
    expect(screen.queryByText('Notices could not be loaded.')).toBeNull();
  });

  it('asks the server for decided notices and pages past the first window', async () => {
    const decided = (reference: string, status: string) => ({
      id: `id-${reference}`,
      reference,
      noticeType: 'copyright',
      reporterName: 'Reporter',
      reporterEmail: 'reporter@example.com',
      reporterOrganization: null,
      targetKind: 'conversation-share',
      targetToken: `token-${reference}`,
      targetOwnerId: null,
      workDescription: 'Work',
      statement: 'Statement',
      status,
      dispositionNote: 'Decided',
      createdAt: '2026-10-01T00:00:00.000Z',
      resolvedAt: null,
    });
    const fetchMock = vi.fn(async (url: string) => {
      const query = new URL(url, 'http://localhost').searchParams;
      const body =
        query.get('status') === 'received'
          ? { notices: [], nextCursor: null }
          : query.get('before')
            ? { notices: [decided('CN-OLD', 'counter_notified')], nextCursor: null }
            : { notices: [decided('CN-NEW', 'rejected')], nextCursor: 'cursor-1' };
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<CopyrightNoticeQueuePanel />);
    await screen.findByText('No notice is waiting for a decision.');
    fireEvent.click(screen.getByRole('button', { name: 'Decided' }));

    expect(await screen.findByText('CN-NEW')).toBeTruthy();
    const decidedCall = fetchMock.mock.calls.at(-1)?.[0] ?? '';
    expect(new URL(decidedCall, 'http://localhost').searchParams.get('status')).toBe('decided');

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(await screen.findByText('CN-OLD')).toBeTruthy();
    expect(screen.getByText('CN-NEW')).toBeTruthy();
    const moreCall = fetchMock.mock.calls.at(-1)?.[0] ?? '';
    expect(new URL(moreCall, 'http://localhost').searchParams.get('before')).toBe('cursor-1');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull());
  });

  describe('recording a removal that already happened', () => {
    const waiting = {
      id: 'id-CN-1',
      reference: 'CN-1',
      noticeType: 'copyright',
      reporterName: 'Reporter',
      reporterEmail: 'reporter@example.com',
      reporterOrganization: null,
      targetKind: 'conversation-share',
      targetToken: 'token-CN-1',
      targetOwnerId: null,
      workDescription: 'Work',
      statement: 'Statement',
      status: 'received',
      dispositionNote: null,
      createdAt: '2026-10-01T00:00:00.000Z',
      resolvedAt: null,
    };

    function stubAdmin(takedownStatus: number) {
      const posts: Array<{ url: string; body: unknown }> = [];
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          posts.push({ url, body: JSON.parse(String(init.body)) });
          const ok = url.includes('takedown') ? takedownStatus === 200 : true;
          const status = url.includes('takedown') ? takedownStatus : 200;
          return { ok, status, json: async () => ({ success: ok }) } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ notices: [waiting], nextCursor: null }),
        } as unknown as Response;
      });
      vi.stubGlobal('fetch', fetchMock);
      return posts;
    }

    it('offers to record the notice when the link no longer serves anything', async () => {
      const posts = stubAdmin(404);

      render(<CopyrightNoticeQueuePanel />);
      await screen.findByText('CN-1');
      fireEvent.change(screen.getByLabelText('Decision note'), { target: { value: 'Removed' } });
      fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
      const confirmButtons = await screen.findAllByRole('button', { name: 'Unpublish' });
      fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

      const record = await screen.findByRole('button', { name: 'Record as unpublished' });
      expect(posts.map((post) => post.url)).toEqual(['/api/admin/takedown']);

      fireEvent.click(record);

      await waitFor(() =>
        expect(posts.map((post) => post.url)).toEqual([
          '/api/admin/takedown',
          '/api/admin/copyright-notices',
        ]),
      );
      expect(posts[1]?.body).toEqual({ reference: 'CN-1', status: 'actioned', note: 'Removed' });
    });

    it('records nothing when the operator declines the offer', async () => {
      const posts = stubAdmin(404);

      render(<CopyrightNoticeQueuePanel />);
      await screen.findByText('CN-1');
      fireEvent.change(screen.getByLabelText('Decision note'), { target: { value: 'Removed' } });
      fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
      const confirmButtons = await screen.findAllByRole('button', { name: 'Unpublish' });
      fireEvent.click(confirmButtons[confirmButtons.length - 1]!);
      await screen.findByRole('button', { name: 'Record as unpublished' });

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(posts.map((post) => post.url)).toEqual(['/api/admin/takedown']);
    });

    it('does not offer it when the takedown failed for another reason', async () => {
      const posts = stubAdmin(500);

      render(<CopyrightNoticeQueuePanel />);
      await screen.findByText('CN-1');
      fireEvent.change(screen.getByLabelText('Decision note'), { target: { value: 'Removed' } });
      fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
      const confirmButtons = await screen.findAllByRole('button', { name: 'Unpublish' });
      fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

      await waitFor(() => expect(posts).toHaveLength(1));
      expect(screen.queryByRole('button', { name: 'Record as unpublished' })).toBeNull();
    });
  });
});

type ImportedModule0 = typeof import('@/lib/client/csrf');
