import type { WebFetch } from '@/test/fetch';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import { CONVERSATION_SHARES_PATH, conversationSharePath } from '@agiworkforce/cloud-contracts';
import { SharedLinksSection } from './SharedLinksSection';

// Source-only fixtures: UNRUN. Mocked observations do not establish browser identity delivery.
const boundary = vi.hoisted(() => ({
  session: null as SessionAuthority | null,
  snapshot: vi.fn<() => SessionAuthority | null>(),
  listeners: new Set<() => void>(),
  fetch: vi.fn<WebFetch>(),
  csrf: vi.fn<() => Promise<Record<string, string>>>(),
  clipboard: vi.fn<(text: string) => Promise<void>>(),
}));

vi.mock('@/lib/identity/useSessionSnapshot', () => ({
  useSessionSnapshot: () => boundary.snapshot,
}));
vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: () => boundary.csrf() }));
vi.mock('./PublishedArtifactsSection', () => ({ PublishedArtifactsSection: () => null }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function session(userId = 'owner-a', sessionId = 'session-a'): SessionAuthority {
  const captured: SessionAuthority = {
    userId,
    sessionId,
    isCurrent: () => boundary.session === captured,
    getToken: vi.fn(async () => `token-${sessionId}`),
    subscribe: (listener) => {
      boundary.listeners.add(listener);
      return () => {
        boundary.listeners.delete(listener);
      };
    },
  };
  return captured;
}

function observe(next: SessionAuthority | null) {
  boundary.fetch.mockImplementation(async () => inventory([share('link-b', 'Owner B planning')]));
  act(() => {
    boundary.session = next;
    for (const listener of [...boundary.listeners]) listener();
  });
}

function share(token = 'link-a', title = 'Owner A planning') {
  return {
    token,
    title,
    shareUrl: `https://example.test/share/${token}`,
    modelId: null,
    provider: null,
    messageCount: 2,
    visibility: 'public',
    createdAt: '2026-11-01T00:00:00.000Z',
    expiresAt: '2026-12-01T00:00:00.000Z',
    expired: false,
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function inventory(shares = [share()], complete = true) {
  return response({ shares, complete });
}

async function show() {
  const mounted = render(<SharedLinksSection />);
  await screen.findByText('Owner A planning');
  return mounted;
}

async function confirmRevoke() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Revoke' })[0]!);
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(/immediately lose access/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke link' }));
}

function expectNoOldFeedback() {
  expect(screen.queryByText('Owner A planning')).toBeNull();
  expect(screen.queryByText(/Copied the link|Revoked the link|old failure/)).toBeNull();
  expect(screen.queryByRole('alertdialog')).toBeNull();
}

describe('Shared conversation links identity lifetime (UNRUN source fixtures)', () => {
  beforeEach(() => {
    boundary.listeners.clear();
    boundary.snapshot.mockReset().mockImplementation(() => boundary.session);
    boundary.session = session();
    boundary.fetch.mockReset().mockImplementation(async () => inventory());
    boundary.csrf.mockReset().mockResolvedValue({ 'X-CSRF-Token': 'csrf-a' });
    boundary.clipboard.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', boundary.fetch);
    vi.stubGlobal('navigator', { clipboard: { writeText: boundary.clipboard } });
    vi.spyOn(window, 'open').mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('dispatches current list, copy, open and confirmed revoke through real authority', async () => {
    boundary.fetch
      .mockResolvedValueOnce(inventory())
      .mockResolvedValueOnce(response({ success: true }));
    await show();
    expect(boundary.fetch).toHaveBeenCalledWith(
      CONVERSATION_SHARES_PATH,
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(new Headers(boundary.fetch.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer token-session-a',
    );
    expect(screen.queryByRole('link', { name: 'Open' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(window.open).toHaveBeenCalledWith(share().shareUrl, '_blank', 'noopener,noreferrer');
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByText('Copied the link for “Owner A planning”.');
    expect(boundary.clipboard).toHaveBeenCalledWith(share().shareUrl);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(boundary.csrf).not.toHaveBeenCalled();
    expect(boundary.fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke link' }));
    await screen.findByText('Revoked the link for “Owner A planning”.');
    expect(boundary.fetch).toHaveBeenLastCalledWith(
      conversationSharePath('link-a'),
      expect.objectContaining({ method: 'DELETE', credentials: 'omit' }),
    );
    expect(new Headers(boundary.fetch.mock.calls[1]?.[1]?.headers).get('X-CSRF-Token')).toBe(
      'csrf-a',
    );
    expect(screen.getByText('No shared links')).toBeInTheDocument();
  });

  it.each(['account', 'incarnation', 'unavailable'] as const)(
    'retires rows, notices and confirmation on observed %s change',
    async (change) => {
      await show();
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
      await screen.findByText(/Copied the link/);
      fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
      const confirm = await screen.findByRole('button', { name: 'Revoke link' });
      observe(
        change === 'unavailable'
          ? null
          : session(change === 'account' ? 'owner-b' : 'owner-a', 'session-b'),
      );
      expectNoOldFeedback();
      fireEvent.click(confirm);
      expect(boundary.csrf).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(boundary.fetch).toHaveBeenCalledTimes(change === 'unavailable' ? 1 : 2),
      );
      expect(boundary.fetch.mock.calls.every(([, init]) => init?.method !== 'DELETE')).toBe(true);
    },
  );

  it('lets the buttons of a row wrap under its title and details on a narrow screen', async () => {
    await show();

    const summary = screen.getByText('Owner A planning').parentElement!;
    const row = summary.parentElement!;
    expect(row.style.flexWrap).toBe('wrap');
    expect(summary.style.flex).toBe('1 1 12rem');
    expect(within(row).getAllByRole('button')).toHaveLength(3);
  });

  it('puts the buttons under the title on a phone so the title keeps the full width', async () => {
    await show();

    const summary = screen.getByText('Owner A planning').parentElement!;
    expect(summary.className.split(/\s+/)).toContain('max-md:basis-full!');
    expect(summary.nextElementSibling?.querySelectorAll('button')).toHaveLength(3);
  });

  it('does not dispatch for an unavailable initial session', async () => {
    boundary.session = null;
    render(<SharedLinksSection />);
    await act(async () => {});
    expect(boundary.fetch).not.toHaveBeenCalled();
    expect(boundary.csrf).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
    expect(screen.queryByText('No shared links')).toBeNull();
  });

  it('suppresses an initial list dispatch whose captured token resolves after retirement', async () => {
    const token = deferred<string | null>();
    const oldSession = boundary.session!;
    vi.mocked(oldSession.getToken).mockReturnValueOnce(token.promise);
    render(<SharedLinksSection />);
    await waitFor(() => expect(oldSession.getToken).toHaveBeenCalledOnce());
    observe(null);
    await act(async () => token.resolve('retired-token'));
    expect(boundary.fetch).not.toHaveBeenCalled();
    expect(screen.getByText('Sign in to manage shared conversation links.')).toBeInTheDocument();
    expectNoOldFeedback();
  });

  it('reports a current token failure without treating it as an empty inventory', async () => {
    vi.mocked(boundary.session!.getToken).mockResolvedValueOnce(null);
    render(<SharedLinksSection />);
    await screen.findByText('Shared links could not be loaded');
    expect(boundary.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText('No shared links')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it.each(['success', 'error', 'reject'] as const)(
    'ignores old pending list %s after retirement',
    async (kind) => {
      const pending = deferred<Response>();
      boundary.fetch.mockReturnValueOnce(pending.promise);
      render(<SharedLinksSection />);
      await waitFor(() => expect(boundary.fetch).toHaveBeenCalledTimes(1));
      const signal = boundary.fetch.mock.calls[0]?.[1]?.signal;
      observe(session('owner-b', 'session-b'));
      await act(async () => {
        if (kind === 'reject') pending.reject(new Error('old failure'));
        else
          pending.resolve(
            kind === 'success' ? inventory() : response({ error: 'old failure' }, 500),
          );
      });
      expect(signal?.aborted).toBe(true);
      expectNoOldFeedback();
      expect(await screen.findByText('Owner B planning')).toBeInTheDocument();
      expect(boundary.fetch).toHaveBeenCalledTimes(2);
    },
  );

  it.each([200, 500])(
    'ignores a retired list body already awaiting JSON at status %s',
    async (status) => {
      const body = deferred<unknown>();
      const wire = response({}, status);
      const json = vi.spyOn(wire, 'json').mockReturnValue(body.promise);
      boundary.fetch.mockResolvedValueOnce(wire);
      render(<SharedLinksSection />);
      await waitFor(() => expect(json).toHaveBeenCalledOnce());
      observe(session('owner-b', 'session-b'));
      await act(async () =>
        body.resolve(
          status === 200 ? { shares: [share()], complete: true } : { error: 'old failure' },
        ),
      );
      expectNoOldFeedback();
    },
  );

  it('suppresses retained row dispatch even before a session notification', async () => {
    await show();
    const open = screen.getByRole('button', { name: 'Open' });
    const copy = screen.getByRole('button', { name: 'Copy' });
    const revoke = screen.getByRole('button', { name: 'Revoke' });
    boundary.session = session('owner-b', 'session-b');
    fireEvent.click(open);
    fireEvent.click(copy);
    fireEvent.click(revoke);
    expect(window.open).not.toHaveBeenCalled();
    expect(boundary.clipboard).not.toHaveBeenCalled();
    expect(boundary.csrf).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('guards a retained confirmation before CSRF acquisition without a notification', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    const confirm = await screen.findByRole('button', { name: 'Revoke link' });
    boundary.session = session('owner-a', 'session-new');
    fireEvent.click(confirm);
    expect(boundary.csrf).not.toHaveBeenCalled();
    expect(boundary.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['csrf', 'token'] as const)(
    'prevents revoke dispatch when retirement occurs during %s',
    async (stage) => {
      await show();
      const gate = deferred<string | null>();
      const csrf = deferred<Record<string, string>>();
      if (stage === 'csrf') boundary.csrf.mockReturnValueOnce(csrf.promise);
      else vi.mocked(boundary.session!.getToken).mockReturnValueOnce(gate.promise);
      await confirmRevoke();
      await waitFor(() => expect(boundary.csrf).toHaveBeenCalledOnce());
      if (stage === 'token')
        await waitFor(() => expect(boundary.session!.getToken).toHaveBeenCalledTimes(2));
      observe(session('owner-a', 'session-new'));
      await act(async () => {
        csrf.resolve({ 'X-CSRF-Token': 'old-csrf' });
        gate.resolve('old-token');
      });
      expect(await screen.findByText('Owner B planning')).toBeInTheDocument();
      expect(boundary.fetch).toHaveBeenCalledTimes(2);
      expect(boundary.fetch.mock.calls.every(([, init]) => init?.method !== 'DELETE')).toBe(true);
      expectNoOldFeedback();
    },
  );

  it.each(['success', 'error', 'reject'] as const)(
    'ignores late revoke %s and does not retry a dispatched mutation',
    async (kind) => {
      const pending = deferred<Response>();
      boundary.fetch.mockResolvedValueOnce(inventory()).mockReturnValueOnce(pending.promise);
      await show();
      await confirmRevoke();
      await waitFor(() => expect(boundary.fetch).toHaveBeenCalledTimes(2));
      observe(session('owner-b', 'session-b'));
      await act(async () => {
        if (kind === 'reject') pending.reject(new Error('old failure'));
        else
          pending.resolve(
            response(
              kind === 'success' ? { success: true } : { error: 'old failure' },
              kind === 'success' ? 200 : 500,
            ),
          );
      });
      expectNoOldFeedback();
      expect(await screen.findByText('Owner B planning')).toBeInTheDocument();
      expect(boundary.fetch).toHaveBeenCalledTimes(3);
      expect(
        boundary.fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE'),
      ).toHaveLength(1);
      expect(boundary.csrf).toHaveBeenCalledOnce();
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'suppresses stale clipboard %s feedback',
    async (kind) => {
      const pending = deferred<void>();
      boundary.clipboard.mockReturnValueOnce(pending.promise);
      await show();
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
      observe(session('owner-a', 'session-new'));
      await act(async () => {
        if (kind === 'resolve') pending.resolve();
        else pending.reject(new Error('old failure'));
      });
      expectNoOldFeedback();
      expect(screen.queryByText(/Could not copy the link/)).toBeNull();
    },
  );

  it('aborts pending work and unsubscribes on unmount', async () => {
    const pending = deferred<Response>();
    boundary.fetch.mockReturnValueOnce(pending.promise);
    const mounted = render(<SharedLinksSection />);
    await waitFor(() => expect(boundary.fetch).toHaveBeenCalledOnce());
    const signal = boundary.fetch.mock.calls[0]?.[1]?.signal;
    expect(boundary.listeners.size).toBe(1);
    mounted.unmount();
    expect(boundary.listeners.size).toBe(0);
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(inventory()));
    expectNoOldFeedback();
  });

  it('admits a fresh activation after StrictMode effect cleanup replay', async () => {
    const mounted = render(
      <StrictMode>
        <SharedLinksSection />
      </StrictMode>,
    );
    await screen.findByText('Owner A planning');
    expect(boundary.listeners.size).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByText('Copied the link for “Owner A planning”.');
    expect(boundary.clipboard).toHaveBeenCalledOnce();
    mounted.unmount();
    expect(boundary.listeners.size).toBe(0);
  });

  it('keeps its captured session across ordinary rerenders rather than restarting the list', async () => {
    const mounted = await show();
    const captures = boundary.snapshot.mock.calls.length;
    mounted.rerender(<SharedLinksSection />);
    expect(boundary.snapshot).toHaveBeenCalledTimes(captures);
    expect(boundary.fetch).toHaveBeenCalledOnce();
    expect(boundary.listeners.size).toBe(1);
    expect(screen.getByText('Owner A planning')).toBeInTheDocument();
  });

  it('serializes Retry and invalidates old rows instead of allowing a superseded list to restore them', async () => {
    const reread = deferred<Response>();
    boundary.clipboard.mockRejectedValueOnce(new Error('copy failed'));
    boundary.fetch.mockResolvedValueOnce(inventory()).mockReturnValueOnce(reread.promise);
    await show();
    const oldOpen = screen.getByRole('button', { name: 'Open' });
    const oldRevoke = screen.getByRole('button', { name: 'Revoke' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    const retry = await screen.findByRole('button', { name: 'Retry' });
    fireEvent.click(retry);
    fireEvent.click(retry);
    fireEvent.click(oldOpen);
    fireEvent.click(oldRevoke);
    await waitFor(() => expect(boundary.fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Loading shared links…')).toBeInTheDocument();
    expect(screen.queryByText('Owner A planning')).toBeNull();
    expect(window.open).not.toHaveBeenCalled();
    expect(boundary.csrf).not.toHaveBeenCalled();
    await act(async () => reread.resolve(inventory([share('link-c', 'Fresh inventory')])));
    expect(screen.getByText('Fresh inventory')).toBeInTheDocument();
    expect(screen.queryByText('Owner A planning')).toBeNull();
    fireEvent.click(retry);
    expect(boundary.fetch).toHaveBeenCalledTimes(2);
  });

  it('rereads after a failed revoke without replaying the mutation or retaining its confirmation', async () => {
    boundary.fetch
      .mockResolvedValueOnce(inventory())
      .mockResolvedValueOnce(response({ error: 'Could not revoke' }, 503))
      .mockResolvedValueOnce(inventory([share('link-c', 'Fresh inventory')]));
    await show();
    await confirmRevoke();
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not confirm whether the link was revoked. Reload the list to check.',
    );
    expect(boundary.fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(retry);
    await screen.findByText('Fresh inventory');
    expect(boundary.fetch).toHaveBeenCalledTimes(3);
    expect(boundary.fetch.mock.calls[2]?.[0]).toBe(CONVERSATION_SHARES_PATH);
    expect(boundary.fetch.mock.calls[2]?.[1]?.method ?? 'GET').toBe('GET');
    expect(boundary.fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(
      1,
    );
    expect(boundary.csrf).toHaveBeenCalledOnce();
    expect(screen.queryByText('Owner A planning')).toBeNull();
  });

  it.each(['list', 'revoke', 'copy'] as const)(
    'old %s settlement and finally cannot clear a replacement session busy state',
    async (kind) => {
      const oldResponse = deferred<Response>();
      const oldCopy = deferred<void>();
      const newList = deferred<Response>();
      const newCopy = deferred<void>();
      if (kind === 'list') {
        boundary.fetch.mockReturnValueOnce(oldResponse.promise);
        render(<SharedLinksSection />);
        await waitFor(() => expect(boundary.fetch).toHaveBeenCalledOnce());
      } else {
        boundary.fetch.mockResolvedValueOnce(inventory());
        await show();
        if (kind === 'revoke') {
          boundary.fetch.mockReturnValueOnce(oldResponse.promise);
          await confirmRevoke();
          await waitFor(() => expect(boundary.fetch).toHaveBeenCalledTimes(2));
        } else {
          boundary.clipboard.mockReturnValueOnce(oldCopy.promise);
          fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
        }
      }
      boundary.fetch.mockReturnValueOnce(newList.promise);
      observe(session('owner-b', 'session-b'));
      await act(async () => newList.resolve(inventory([share('link-b', 'Owner B planning')])));
      await screen.findByText('Owner B planning');
      boundary.clipboard.mockReturnValueOnce(newCopy.promise);
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
      expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled();
      await act(async () => {
        oldResponse.resolve(kind === 'revoke' ? response({ success: true }) : inventory());
        oldCopy.resolve();
      });
      expect(screen.getByText('Owner B planning')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
      expectNoOldFeedback();
      await act(async () => newCopy.resolve());
      expect(screen.getByRole('button', { name: 'Open' })).toBeEnabled();
      expect(screen.getByText('Copied the link for “Owner B planning”.')).toBeInTheDocument();
    },
  );

  it.each([200, 500])(
    'ignores a retired revoke body already awaiting JSON at status %s',
    async (status) => {
      const body = deferred<unknown>();
      const wire = response({}, status);
      const json = vi.spyOn(wire, 'json').mockReturnValue(body.promise);
      boundary.fetch.mockResolvedValueOnce(inventory()).mockResolvedValueOnce(wire);
      await show();
      await confirmRevoke();
      await waitFor(() => expect(json).toHaveBeenCalledOnce());
      observe(session('owner-a', 'session-new'));
      await act(async () =>
        body.resolve(status === 200 ? { success: true } : { error: 'old failure' }),
      );
      expectNoOldFeedback();
      expect(
        boundary.fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE'),
      ).toHaveLength(1);
    },
  );

  it.each([undefined, false, true])(
    'preserves completeness %s after per-token removal',
    async (complete) => {
      boundary.fetch
        .mockResolvedValueOnce(
          response({
            shares: [share(), share('link-b', 'Other link')],
            ...(complete === undefined ? {} : { complete }),
          }),
        )
        .mockResolvedValueOnce(response({ success: true }))
        .mockResolvedValueOnce(response({ success: true }));
      await show();
      await confirmRevoke();
      await screen.findByText('Revoked the link for “Owner A planning”.');
      expect(screen.queryByText('Owner A planning')).toBeNull();
      expect(screen.getByText('Other link')).toBeInTheDocument();
      await confirmRevoke();
      await screen.findByText(complete ? 'No shared links' : 'No shared links shown');
      expect(Boolean(screen.queryByText(/This list may be incomplete/))).toBe(!complete);
      expect(boundary.fetch).toHaveBeenCalledTimes(3);
    },
  );

  it.each([{}, { success: false }])(
    'retains the row when a successful HTTP revoke lacks its exact receipt: %j',
    async (receipt) => {
      boundary.fetch
        .mockResolvedValueOnce(inventory())
        .mockResolvedValueOnce(response(receipt))
        .mockResolvedValueOnce(inventory([share('link-c', 'Fresh inventory')]));
      await show();
      await confirmRevoke();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not confirm whether the link was revoked. Reload the list to check.',
      );
      expect(screen.getByText('Owner A planning')).toBeInTheDocument();
      expect(screen.queryByText(/Revoked the link/)).toBeNull();
      expect(boundary.fetch).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alertdialog')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await screen.findByText('Fresh inventory');
      expect(boundary.fetch).toHaveBeenCalledTimes(3);
      expect(boundary.fetch.mock.calls[2]?.[0]).toBe(CONVERSATION_SHARES_PATH);
      expect(boundary.fetch.mock.calls[2]?.[1]?.method ?? 'GET').toBe('GET');
      expect(
        boundary.fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE'),
      ).toHaveLength(1);
      expect(boundary.csrf).toHaveBeenCalledOnce();
    },
  );
});
