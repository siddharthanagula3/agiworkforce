/**
 * DesktopLibrary.test.tsx — the desktop half of the Library transport.
 *
 * The shared view is covered in @agiworkforce/unified-chat. What is desktop's
 * alone is the transport: which URL each call hits, that it goes through
 * the account-pinned request context rather than a bare fetch, and that a
 * relative asset uri is resolved against Cloud — in a Tauri webview a
 * relative URL resolves to tauri://localhost and 404s. Preview bytes use that
 * same authenticated path and stay inside an app-owned dialog.
 *
 * These surfaces cannot be reached signed-out, and a signed-in session cannot
 * be synthesised (the auth store deliberately never persists accessToken), so
 * this is the level at which the wiring is verifiable without credentials.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  accountId: 'account-a',
  assertBoundary: vi.fn(),
  createManagedCloudRequestContext: vi.fn(),
  exerciseLifecycle: false,
  fetch: vi.fn(),
  fetchExternal: vi.fn(),
  getHeaders: vi.fn(),
  sessionEpoch: 1,
  signedIn: true,
}));

vi.mock('@/api/cloudApi', () => ({
  CLOUD_API_BASE_URL: 'https://agiworkforce.com',
}));
vi.mock('@/services/managedCloudRequestContext', () => ({
  createManagedCloudRequestContext: (...args: unknown[]) =>
    mocks.createManagedCloudRequestContext(...args),
}));
vi.mock('@/stores/auth', () => ({
  selectHasCloudAccountSession: () => mocks.signedIn,
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      cloudSessionEpoch: mocks.sessionEpoch,
      user: mocks.accountId ? { id: mocks.accountId } : null,
    }),
}));

interface CapturedLibraryTransport {
  isSignedIn: boolean;
  listPage(params: URLSearchParams): Promise<unknown>;
  fetchAsset(uri: string): Promise<unknown>;
  deleteItem(id: string): Promise<unknown>;
  permanentlyDeleteItem(id: string): Promise<unknown>;
  restoreItem(id: string): Promise<unknown>;
  openPreview(uri: string): void;
  inlinePreviewUri?: (uri: string) => string;
}

const captured: { transport?: CapturedLibraryTransport } = {};
vi.mock('@agiworkforce/unified-chat', async () => {
  const React = await import('react');
  return {
    LibraryView: (props: { transport: CapturedLibraryTransport }) => {
      captured.transport = props.transport;
      const [loadedOwner, setLoadedOwner] = React.useState('');
      React.useEffect(() => {
        if (!mocks.exerciseLifecycle) return;
        let active = true;
        void props.transport
          .listPage(new URLSearchParams())
          .then((response) => response as Response)
          .then((response) => response.json())
          .then((body: { owner?: string }) => {
            if (active) setLoadedOwner(body.owner ?? '');
          });
        return () => {
          active = false;
        };
      }, [props.transport]);
      return <div data-testid="shared-library">{loadedOwner}</div>;
    },
  };
});

/** Fail loudly rather than optional-chaining past a transport that never arrived. */
function transport(): CapturedLibraryTransport {
  if (!captured.transport) throw new Error('LibraryView was never rendered with a transport');
  return captured.transport;
}

const { DesktopLibrary } = await import('../DesktopLibrary');

describe('DesktopLibrary transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accountId = 'account-a';
    mocks.exerciseLifecycle = false;
    mocks.sessionEpoch = 1;
    mocks.signedIn = true;
    mocks.getHeaders.mockResolvedValue({ Authorization: 'Bearer account-token' });
    mocks.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
    mocks.fetchExternal.mockResolvedValue(new Response('{}', { status: 200 }));
    mocks.createManagedCloudRequestContext.mockReturnValue({
      assertBoundary: mocks.assertBoundary,
      fetch: mocks.fetch,
      fetchExternal: mocks.fetchExternal,
      getHeaders: mocks.getHeaders,
    });
    captured.transport = undefined;
  });

  it('asks for sign-in rather than rendering an empty library', () => {
    mocks.signedIn = false;
    render(<DesktopLibrary />);

    // "You have no files" and "we cannot see your files" are different claims.
    expect(screen.getByText(/Sign in to see your Library/i)).toBeTruthy();
    expect(screen.queryByTestId('shared-library')).toBeNull();
  });

  it('lists against the Cloud origin with the account bearer', async () => {
    render(<DesktopLibrary />);
    await transport().listPage(new URLSearchParams({ limit: '30' }));

    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://agiworkforce.com/api/library?limit=30');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer account-token');
    expect(init.credentials).toBe('include');
  });

  it('resolves a relative asset uri against Cloud', async () => {
    render(<DesktopLibrary />);
    await transport().fetchAsset('/api/files/a1');

    // A relative URL inside a Tauri webview resolves to tauri://localhost.
    expect(mocks.fetch.mock.calls[0]![0]).toBe('https://agiworkforce.com/api/files/a1');
    expect(new Headers(mocks.fetch.mock.calls[0]![1].headers).get('Authorization')).toBe(
      'Bearer account-token',
    );
  });

  it('keeps the AGI bearer off an external absolute asset uri', async () => {
    render(<DesktopLibrary />);
    await transport().fetchAsset('https://cdn.example.com/a2.png');

    expect(mocks.fetchExternal).toHaveBeenCalledWith('https://cdn.example.com/a2.png', {});
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.getHeaders).not.toHaveBeenCalled();
  });

  it('posts a restore for the encoded id', async () => {
    render(<DesktopLibrary />);
    await transport().restoreItem('a/b');

    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://agiworkforce.com/api/media?id=a%2Fb');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer account-token');
  });

  it('soft-deletes through the account-pinned Cloud transport', async () => {
    render(<DesktopLibrary />);
    await transport().deleteItem('a/b');

    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://agiworkforce.com/api/media?id=a%2Fb');
    expect(init.method).toBe('DELETE');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer account-token');
  });

  it('permanently deletes a trashed asset through the account-pinned Cloud transport', async () => {
    render(<DesktopLibrary />);
    await transport().permanentlyDeleteItem('a/b');

    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://agiworkforce.com/api/media?id=a%2Fb&permanent=true');
    expect(init.method).toBe('DELETE');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer account-token');
  });

  it('fetches protected preview bytes with the bearer and never exposes a direct image uri', async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/plain' }),
      blob: async () =>
        ({ type: 'text/plain', text: async () => 'preview text' }) as unknown as Blob,
    } as Response);
    render(<DesktopLibrary />);
    act(() => transport().openPreview('/api/files/a1'));

    await waitFor(() => expect(screen.getByText('preview text')).toBeTruthy());
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe('https://agiworkforce.com/api/files/a1');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer account-token');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(transport().inlinePreviewUri).toBeUndefined();
  });

  it('aborts and clears an account A preview when the session changes to B', async () => {
    let resolvePreview!: (response: Response) => void;
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolvePreview = resolve;
        }),
    );
    const rendered = render(<DesktopLibrary />);
    act(() => transport().openPreview('/api/files/account-a-private'));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    const signal = mocks.fetch.mock.calls[0]![1].signal as AbortSignal;

    mocks.accountId = 'account-b';
    mocks.sessionEpoch = 2;
    rendered.rerender(<DesktopLibrary />);

    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();

    resolvePreview({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/plain' }),
      blob: async () =>
        ({ type: 'text/plain', text: async () => 'account A preview' }) as unknown as Blob,
    } as Response);
    await act(async () => Promise.resolve());
    expect(screen.queryByText('account A preview')).toBeNull();
  });

  it('remounts and clears loaded account A rows when the session changes to B', async () => {
    mocks.exerciseLifecycle = true;
    mocks.createManagedCloudRequestContext.mockImplementation(() => {
      const owner = mocks.accountId;
      return {
        assertBoundary: mocks.assertBoundary,
        fetchExternal: mocks.fetchExternal,
        getHeaders: mocks.getHeaders,
        fetch: vi.fn(
          async () =>
            new Response(JSON.stringify({ owner }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
        ),
      };
    });
    const rendered = render(<DesktopLibrary />);
    await waitFor(() => expect(screen.getByTestId('shared-library').textContent).toBe('account-a'));

    mocks.accountId = 'account-b';
    mocks.sessionEpoch = 2;
    rendered.rerender(<DesktopLibrary />);

    expect(screen.getByTestId('shared-library').textContent).toBe('');
    await waitFor(() => expect(screen.getByTestId('shared-library').textContent).toBe('account-b'));
    expect(mocks.createManagedCloudRequestContext).toHaveBeenCalledTimes(2);
  });
});
