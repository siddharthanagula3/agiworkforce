import { Children, isValidElement, StrictMode, type MouseEvent, type ReactNode } from 'react';
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  type DataExportArchive,
} from '@agiworkforce/cloud-contracts';
import { DataExportRow } from '../DataExportRow';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { observePreferenceOwner } from '@/app/settings/_lib/preferences-client';
import type { SessionAuthority } from '@/lib/identity/request-authority';

const identity = vi.hoisted(() => ({ session: null as SessionAuthority | null }));
vi.mock('@/lib/identity/useSessionSnapshot', async (original) => ({
  ...(await original<MockedModule0>()),
  useSessionSnapshot: () => () => identity.session,
}));

function session(userId = 'export-owner', sessionId = 'export-session'): SessionAuthority {
  const owner: SessionAuthority = {
    userId,
    sessionId,
    isCurrent: () => identity.session === owner,
    getToken: vi.fn(async () => `token-${sessionId}`),
  };
  return owner;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function hostProps<T>(node: ReactNode, type: string): T | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === type) return node.props as T;
  for (const child of Children.toArray(node.props.children)) {
    const found = hostProps<T>(child, type);
    if (found) return found;
  }
  return undefined;
}

beforeEach(() => {
  observePreferenceOwner(null);
  identity.session = session();
  vi.mocked(addCsrfHeaders).mockReset().mockResolvedValue({ 'x-csrf-token': 'token' });
});

type CsrfModule = typeof import('@/lib/client/csrf');

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  addCsrfHeaders: vi.fn(async () => ({ 'x-csrf-token': 'token' })),
}));

const ARCHIVES_PATH = '/api/user/export/archives';
const EXPORT_PATH = '/api/user/export';

function archive(overrides: Partial<DataExportArchive> = {}): DataExportArchive {
  return {
    id: 'export-1',
    status: 'preparing',
    delivery: 'in_app',
    requestedAt: '2026-10-16T10:00:00.000Z',
    readyAt: null,
    expiresAt: null,
    volumes: [],
    ...overrides,
  };
}

const readyArchive = (volumeCount: number) =>
  archive({
    status: 'ready',
    readyAt: '2026-10-16T10:05:00.000Z',
    expiresAt: '2026-10-17T10:05:00.000Z',
    volumes: Array.from({ length: volumeCount }, (_, index) => ({
      volume: index + 1,
      byteCount: 1024,
      fileCount: 2,
      downloadPath: `/api/user/export/archives/export-1?volume=${index + 1}`,
    })),
  });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface FetchScript {
  reads: (DataExportArchive | null)[];
  post?: () => Response;
}

function installFetch(script: FetchScript) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === EXPORT_PATH && init?.method === 'POST') {
      return script.post ? script.post() : json({ archive: archive() }, 202);
    }
    if (url === ARCHIVES_PATH) {
      const next = script.reads.length > 1 ? script.reads.shift()! : (script.reads[0] ?? null);
      return json({ archive: next });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function archiveReads(fetchMock: ReturnType<typeof installFetch>): number {
  return fetchMock.mock.calls.filter(([input]) => String(input) === ARCHIVES_PATH).length;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

afterEach(() => {
  cleanup();
  identity.session = null;
  observePreferenceOwner(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DataExportRow states', () => {
  it('shows a ready export as download links with the time they stop working', async () => {
    installFetch({ reads: [readyArchive(2)] });

    render(<DataExportRow />);

    const first = await screen.findByRole('link', { name: 'Download part 1 of 2' });
    expect(first).toHaveAttribute('href', '/api/user/export/archives/export-1?volume=1');
    expect(screen.getByRole('link', { name: 'Download part 2 of 2' })).toHaveAttribute(
      'href',
      '/api/user/export/archives/export-1?volume=2',
    );
    const expiry = new Date('2026-10-17T10:05:00.000Z').toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    expect(screen.getByText(`The links work until ${expiry}.`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export data' })).toBeEnabled();
  });

  it('names a single archive without part numbers', async () => {
    installFetch({ reads: [readyArchive(1)] });

    render(<DataExportRow />);

    expect(await screen.findByRole('link', { name: 'Download your export' })).toBeInTheDocument();
    expect(screen.getByText(/^The link works until/)).toBeInTheDocument();
  });

  it('reports a failed export as an alert and lets the reader ask again', async () => {
    installFetch({ reads: [archive({ status: 'failed' })] });

    render(<DataExportRow />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't prepare your export. Try again.",
    );
    expect(screen.getByRole('button', { name: 'Export data' })).toBeEnabled();
  });

  it('treats a ready export with no files as one to request again', async () => {
    installFetch({ reads: [readyArchive(0)] });

    render(<DataExportRow />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your export finished without any files to download. Request a new export.',
    );
    expect(screen.queryByText('Your export is ready.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export data' })).toBeEnabled();
  });

  it('says so when the earlier export cannot be checked, instead of showing nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: { message: 'unavailable' } }, 503)),
    );

    render(<DataExportRow />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't check for an earlier export. Reload this page to try again.",
    );
    expect(screen.getByRole('button', { name: 'Export data' })).toBeEnabled();
  });

  it('says an expired export needs a new request', async () => {
    installFetch({ reads: [archive({ status: 'expired' })] });

    render(<DataExportRow />);

    expect(
      await screen.findByText(/download link for your last export has expired/i),
    ).toBeInTheDocument();
  });

  it('promises an email only when the export will be emailed', async () => {
    installFetch({
      reads: [null],
      post: () => json({ archive: archive({ delivery: 'email' }) }, 202),
    });

    render(<DataExportRow />);
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent("We'll email you a download link when it's ready");
    expect(status).toHaveTextContent('it will also appear here');
    expect(status).toHaveTextContent('The link works for 24 hours once it is ready.');
    expect(screen.getByRole('button', { name: /Preparing/ })).toBeDisabled();
  });

  it('points to this page, not an inbox, when email is off', async () => {
    installFetch({ reads: [null], post: () => json({ archive: archive() }, 202) });

    render(<DataExportRow />);
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('A download link will appear here when it');
    expect(status).not.toHaveTextContent(/email/i);
    expect(screen.queryByText(/email/i)).toBeNull();
  });

  it('reconciles an unconfirmed POST without enabling a replay', async () => {
    installFetch({ reads: [null], post: () => json({ error: 'nope' }, 500) });

    render(<DataExportRow />);
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('confirm whether your export was started');
    expect(screen.getByRole('button', { name: 'Export data' })).toBeDisabled();
  });
});

describe('DataExportRow polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('polls with a growing delay until the export is ready, then stops', async () => {
    const fetchMock = installFetch({
      reads: [null, archive(), archive(), readyArchive(1)],
    });

    render(<DataExportRow />);
    await advance(0);
    expect(archiveReads(fetchMock)).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await advance(0);
    expect(screen.getByRole('status')).toHaveTextContent("We're preparing your export.");

    await advance(2_999);
    expect(archiveReads(fetchMock)).toBe(1);
    await advance(1);
    expect(archiveReads(fetchMock)).toBe(2);

    await advance(5_999);
    expect(archiveReads(fetchMock)).toBe(2);
    await advance(1);
    expect(archiveReads(fetchMock)).toBe(3);

    await advance(12_000);
    expect(archiveReads(fetchMock)).toBe(4);
    expect(screen.getByRole('link', { name: 'Download your export' })).toBeInTheDocument();

    await advance(10 * 60_000);
    expect(archiveReads(fetchMock)).toBe(4);
  });

  it('gives up after thirty minutes and offers to check again', async () => {
    const fetchMock = installFetch({ reads: [archive()] });

    render(<DataExportRow />);
    await advance(0);
    expect(screen.getByRole('status')).toHaveTextContent("We're preparing your export.");

    await advance(31 * 60_000);
    expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument();
    const readsWhenStalled = archiveReads(fetchMock);
    expect(readsWhenStalled).toBeLessThanOrEqual(40);

    await advance(30 * 60_000);
    expect(archiveReads(fetchMock)).toBe(readsWhenStalled);

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await advance(3_000);
    expect(archiveReads(fetchMock)).toBe(readsWhenStalled + 1);
    expect(screen.queryByText(/taking longer than usual/i)).toBeNull();
  });

  it('skips hidden reads without resetting backoff or the wall-clock budget', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const fetchMock = installFetch({ reads: [archive()] });
    render(<DataExportRow />);
    await advance(0);
    await advance(3_000);
    expect(archiveReads(fetchMock)).toBe(1);
    visibility.mockReturnValue('visible');
    await advance(5_999);
    expect(archiveReads(fetchMock)).toBe(1);
    await advance(1);
    expect(archiveReads(fetchMock)).toBe(2);
    visibility.mockReturnValue('hidden');
    await advance(31 * 60_000);
    expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument();
    expect(archiveReads(fetchMock)).toBe(2);
  });

  it('retires a pending poll body on account change and leaves the new owner idle', async () => {
    const body = deferred<unknown>();
    const response = json({ archive: null });
    vi.spyOn(response, 'json').mockImplementation(() => body.promise);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ archive: archive() }))
      .mockResolvedValueOnce(response)
      .mockResolvedValue(json({ archive: null }));
    vi.stubGlobal('fetch', fetchMock);
    const rendered = render(<DataExportRow />);
    await advance(0);
    await advance(3_000);
    expect(response.json).toHaveBeenCalled();
    identity.session = session('second-owner', 'second-session');
    rendered.rerender(<DataExportRow />);
    await advance(0);
    await act(async () => body.resolve({ archive: readyArchive(1) }));
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export data' })).toBeEnabled();
  });
});

describe('DataExportRow request ownership', () => {
  it('does not read or export without an admitted session, then reads when one arrives', async () => {
    identity.session = null;
    const fetchMock = installFetch({ reads: [readyArchive(1)] });
    const rendered = render(<DataExportRow />);
    expect(screen.getByRole('button', { name: 'Export data' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
    identity.session = session();
    rendered.rerender(<DataExportRow />);
    expect(await screen.findByRole('link')).toHaveAttribute(
      'href',
      readyArchive(1).volumes[0]!.downloadPath,
    );
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.credentials).toBe('omit');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer token-export-session');
    expect(new Headers(init.headers).has(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(false);
  });

  it.each([null, readyArchive(1)])(
    'ignores an initial read that finishes after POST acceptance (%j)',
    async (old) => {
      const initial = deferred<Response>();
      const fetchMock = vi.fn(async (path: RequestInfo | URL) =>
        String(path) === ARCHIVES_PATH
          ? initial.promise
          : json({ archive: archive({ id: 'new-export' }) }, 202),
      );
      vi.stubGlobal('fetch', fetchMock);
      render(<DataExportRow />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByRole('button', { name: 'Export data' }));
      await screen.findByText(/We're preparing your export/);
      await act(async () => initial.resolve(json({ archive: old })));
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.getByRole('button', { name: 'Preparing…' })).toBeDisabled();
    },
  );

  it('ignores initial JSON parsing that completes after POST acceptance', async () => {
    const body = deferred<unknown>();
    const response = json({ archive: null });
    vi.spyOn(response, 'json').mockImplementation(() => body.promise);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: RequestInfo | URL) =>
        String(path) === ARCHIVES_PATH
          ? response
          : json({ archive: archive({ id: 'new-export' }) }, 202),
      ),
    );
    render(<DataExportRow />);
    await waitFor(() => expect(response.json).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await screen.findByText(/We're preparing your export/);
    await act(async () => body.resolve({ archive: readyArchive(1) }));
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: 'Preparing…' })).toBeDisabled();
  });

  it('rejects a saved same-owner export callback after a newer read snapshot', async () => {
    const initial = deferred<Response>();
    const fetchMock = vi.fn(async () => initial.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => DataExportRow());
    const saved = hostProps<{ onClick: () => void }>(result.current, 'button')!.onClick;
    await act(async () => initial.resolve(json({ archive: readyArchive(1) })));
    expect(hostProps(result.current, 'a')).toBeDefined();
    act(() => saved());
    expect(addCsrfHeaders).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects saved download click and auxiliary callbacks from a retired view', async () => {
    installFetch({ reads: [readyArchive(1)] });
    const { result, unmount } = renderHook(() => DataExportRow());
    type LinkHandlers = {
      onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
      onAuxClick: (event: MouseEvent<HTMLAnchorElement>) => void;
    };
    await waitFor(() => expect(hostProps(result.current, 'a')).toBeDefined());
    const saved = hostProps<LinkHandlers>(result.current, 'a')!;
    unmount();
    const event = { preventDefault: vi.fn() } as unknown as MouseEvent<HTMLAnchorElement>;
    saved.onClick(event);
    saved.onAuxClick(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
  });

  it('masks links and blocks retained link activation before an identity rerender', async () => {
    installFetch({ reads: [readyArchive(1)] });
    const rendered = render(<DataExportRow />);
    const link = await screen.findByRole('link');
    identity.session = session('second-owner', 'second-session');
    const click = createEvent.click(link, { bubbles: true, cancelable: true });
    fireEvent(link, click);
    expect(click.defaultPrevented).toBe(true);
    const auxiliary = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
    fireEvent(link, auxiliary);
    expect(auxiliary.defaultPrevented).toBe(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    rendered.rerender(<DataExportRow />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Your export is ready.')).toBeNull();
  });

  it.each(['different-account', 'new-session', 'return-to-account'])(
    'retires old bodies across %s',
    async (transition) => {
      const body = deferred<unknown>();
      const oldResponse = json({ archive: null });
      vi.spyOn(oldResponse, 'json').mockImplementation(() => body.promise);
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(oldResponse)
        .mockResolvedValue(json({ archive: null }));
      vi.stubGlobal('fetch', fetchMock);
      const original = identity.session!;
      const rendered = render(<DataExportRow />);
      await waitFor(() => expect(oldResponse.json).toHaveBeenCalled());
      identity.session =
        transition === 'new-session'
          ? session(original.userId, 'new-session')
          : session('second-owner', 'second-session');
      rendered.rerender(<DataExportRow />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      if (transition === 'return-to-account') {
        identity.session = session(original.userId, original.sessionId);
        rendered.rerender(<DataExportRow />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
      }
      await act(async () => body.resolve({ archive: readyArchive(1) }));
      expect(screen.queryByRole('link')).toBeNull();
    },
  );

  it.each(['close', 'switch'])(
    'does not dispatch after CSRF preparation outlives %s',
    async (transition) => {
      const headers = deferred<HeadersInit>();
      vi.mocked(addCsrfHeaders).mockReturnValue(headers.promise);
      const fetchMock = installFetch({ reads: [null] });
      const rendered = render(<DataExportRow />);
      fireEvent.click(screen.getByRole('button', { name: 'Export data' }));
      if (transition === 'close') rendered.unmount();
      else {
        identity.session = session('second-owner', 'second-session');
        rendered.rerender(<DataExportRow />);
      }
      await act(async () => headers.resolve({ 'x-csrf-token': 'new-token' }));
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    },
  );

  it('does not dispatch a POST after its captured session token retires', async () => {
    const token = deferred<string | null>();
    const fetchMock = installFetch({ reads: [null] });
    const rendered = render(<DataExportRow />);
    await waitFor(() => expect(archiveReads(fetchMock)).toBe(1));
    vi.mocked(identity.session!.getToken).mockReturnValue(token.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await waitFor(() => expect(identity.session!.getToken).toHaveBeenCalledTimes(2));
    identity.session = session('second-owner', 'second-session');
    rendered.rerender(<DataExportRow />);
    await act(async () => token.resolve('old-token'));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('reserves one POST synchronously and pins it to bearer authentication', async () => {
    const headers = deferred<HeadersInit>();
    vi.mocked(addCsrfHeaders).mockReturnValue(headers.promise);
    const fetchMock = installFetch({ reads: [null] });
    const { result } = renderHook(() => DataExportRow());
    const click = hostProps<{ onClick: () => void }>(result.current, 'button')!.onClick;
    act(() => {
      click();
      click();
    });
    expect(addCsrfHeaders).toHaveBeenCalledTimes(1);
    await act(async () => headers.resolve({ 'x-csrf-token': 'token' }));
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]![1]?.credentials).toBe('omit');
    expect(new Headers(posts[0]![1]?.headers).get('authorization')).toBe(
      'Bearer token-export-session',
    );
  });

  it('permits an explicit retry when header preparation definitely never dispatched', async () => {
    vi.mocked(addCsrfHeaders).mockRejectedValueOnce(new Error('headers unavailable'));
    const fetchMock = installFetch({ reads: [null] });
    render(<DataExportRow />);
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Export data' })).toBeEnabled();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await screen.findByText(/We're preparing your export/);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it.each([null, readyArchive(1)])(
    'keeps uncertainty after reconciliation returns %j and only checks again',
    async (existing) => {
      const fetchMock = installFetch({
        reads: [existing],
        post: () => {
          throw new Error('network interrupted');
        },
      });
      render(<DataExportRow />);
      await waitFor(() => expect(archiveReads(fetchMock)).toBe(1));
      fireEvent.click(screen.getByRole('button', { name: 'Export data' }));
      await waitFor(() => expect(archiveReads(fetchMock)).toBe(2));
      expect(screen.getByRole('alert')).toHaveTextContent(
        'confirm whether your export was started',
      );
      expect(screen.getByRole('button', { name: 'Export data' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
      await waitFor(() => expect(archiveReads(fetchMock)).toBe(3));
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
      expect(screen.getByRole('alert')).toHaveTextContent('latest one we could find');
    },
  );

  it.each([
    [archive({ status: 'failed' }), 'The latest export could not be prepared.'],
    [archive({ status: 'expired' }), 'The download link for the latest export has expired.'],
    [readyArchive(0), 'The latest export finished without any files to download.'],
  ] as const)(
    'does not promise another POST when uncertainty reads terminal archive %j',
    async (existing, message) => {
      const fetchMock = installFetch({
        reads: [existing],
        post: () => json({ error: 'unknown' }, 500),
      });
      render(<DataExportRow />);
      await waitFor(() => expect(archiveReads(fetchMock)).toBe(1));
      fireEvent.click(screen.getByRole('button', { name: 'Export data' }));
      await waitFor(() => expect(archiveReads(fetchMock)).toBe(2));
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.queryByText(/Request a new export|Try again\./)).toBeNull();
      expect(screen.getByRole('button', { name: 'Export data' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled();
    },
  );

  it('does not let an old POST body or finally affect a reopened view', async () => {
    const body = deferred<unknown>();
    const response = json({ archive: null }, 202);
    vi.spyOn(response, 'json').mockImplementation(() => body.promise);
    const fetchMock = installFetch({ reads: [null], post: () => response });
    const first = render(<DataExportRow />);
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await waitFor(() => expect(response.json).toHaveBeenCalled());
    first.unmount();
    render(<DataExportRow />);
    await waitFor(() => expect(archiveReads(fetchMock)).toBeGreaterThanOrEqual(1));
    await act(async () => body.resolve({ archive: readyArchive(1) }));
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export data' })).toBeEnabled();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('ignores a retired POST rejection while the next owner is still exporting', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    let postCount = 0;
    const fetchMock = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'POST') return json({ archive: null });
      postCount += 1;
      return postCount === 1 ? first.promise : second.promise;
    });
    vi.stubGlobal('fetch', fetchMock);
    const rendered = render(<DataExportRow />);
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await waitFor(() => expect(postCount).toBe(1));
    identity.session = session('second-owner', 'second-session');
    rendered.rerender(<DataExportRow />);
    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await waitFor(() => expect(postCount).toBe(2));
    await act(async () => first.reject(new Error('old request failed')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Preparing…' })).toBeDisabled();
    await act(async () => second.resolve(json({ archive: archive({ id: 'second-export' }) }, 202)));
    expect(screen.getByText(/We're preparing your export/)).toBeInTheDocument();
  });

  it('survives StrictMode setup replay without reviving retired token acquisition', async () => {
    const firstToken = deferred<string | null>();
    vi.mocked(identity.session!.getToken).mockReturnValueOnce(firstToken.promise);
    const fetchMock = installFetch({ reads: [readyArchive(1)] });
    render(
      <StrictMode>
        <DataExportRow />
      </StrictMode>,
    );
    await screen.findByRole('link');
    await act(async () => firstToken.resolve('retired-token'));
    expect(archiveReads(fetchMock)).toBe(1);
    expect(screen.getByRole('link')).toBeInTheDocument();
  });
});

type MockedModule0 = typeof import('@/lib/identity/useSessionSnapshot');
