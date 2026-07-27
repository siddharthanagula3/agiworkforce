/**
 * DesktopLibrary.test.tsx — the desktop half of the Library transport.
 *
 * The shared view is covered in @agiworkforce/unified-chat. What is desktop's
 * alone is the transport: which URL each call hits, that it goes through
 * `cloudFetch` (which attaches the bearer token and invalidates the session on
 * 401) rather than a bare fetch, and that a relative asset uri is resolved
 * against Cloud — in a Tauri webview a relative URL resolves to
 * tauri://localhost and 404s.
 *
 * These surfaces cannot be reached signed-out, and a signed-in session cannot
 * be synthesised (the auth store deliberately never persists accessToken), so
 * this is the level at which the wiring is verifiable without credentials.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  cloudFetch: vi.fn(),
  openExternalUrl: vi.fn(),
  signedIn: true,
}));

vi.mock('@/api/cloudApi', () => ({
  CLOUD_API_BASE_URL: 'https://agiworkforce.com',
  cloudFetch: (...args: unknown[]) => mocks.cloudFetch(...args),
}));
vi.mock('@/utils/navigation', () => ({
  openExternalUrl: (...args: unknown[]) => mocks.openExternalUrl(...args),
}));
vi.mock('@/stores/auth', () => ({
  selectHasCloudAccountSession: () => mocks.signedIn,
  useAuthStore: (selector: (s: unknown) => unknown) => selector({}),
}));

interface CapturedLibraryTransport {
  isSignedIn: boolean;
  listPage(params: URLSearchParams): Promise<unknown>;
  fetchAsset(uri: string): Promise<unknown>;
  restoreItem(id: string): Promise<unknown>;
  openPreview(uri: string): void;
}

const captured: { transport?: CapturedLibraryTransport } = {};
vi.mock('@agiworkforce/unified-chat', () => ({
  LibraryView: (props: { transport: CapturedLibraryTransport }) => {
    captured.transport = props.transport;
    return <div data-testid="shared-library" />;
  },
}));

/** Fail loudly rather than optional-chaining past a transport that never arrived. */
function transport(): CapturedLibraryTransport {
  if (!captured.transport) throw new Error('LibraryView was never rendered with a transport');
  return captured.transport;
}

const { DesktopLibrary } = await import('../DesktopLibrary');

describe('DesktopLibrary transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signedIn = true;
    mocks.cloudFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    captured.transport = undefined;
  });

  it('asks for sign-in rather than rendering an empty library', () => {
    mocks.signedIn = false;
    render(<DesktopLibrary />);

    // "You have no files" and "we cannot see your files" are different claims.
    expect(screen.getByText(/Sign in to see your Library/i)).toBeTruthy();
    expect(screen.queryByTestId('shared-library')).toBeNull();
  });

  it('lists against the Cloud origin through cloudFetch', async () => {
    render(<DesktopLibrary />);
    await transport().listPage(new URLSearchParams({ limit: '30' }));

    const [url] = mocks.cloudFetch.mock.calls[0]!;
    expect(url).toBe('https://agiworkforce.com/api/library?limit=30');
  });

  it('resolves a relative asset uri against Cloud', async () => {
    render(<DesktopLibrary />);
    await transport().fetchAsset('/api/files/a1');

    // A relative URL inside a Tauri webview resolves to tauri://localhost.
    expect(mocks.cloudFetch.mock.calls[0]![0]).toBe('https://agiworkforce.com/api/files/a1');
  });

  it('leaves an absolute asset uri alone', async () => {
    render(<DesktopLibrary />);
    await transport().fetchAsset('https://cdn.example.com/a2.png');

    expect(mocks.cloudFetch.mock.calls[0]![0]).toBe('https://cdn.example.com/a2.png');
  });

  it('posts a restore for the encoded id', async () => {
    render(<DesktopLibrary />);
    await transport().restoreItem('a/b');

    const [url, init] = mocks.cloudFetch.mock.calls[0]!;
    expect(url).toBe('https://agiworkforce.com/api/media?id=a%2Fb');
    expect((init as { method?: string }).method).toBe('POST');
  });

  it('opens a preview in the OS browser, not a tab', () => {
    render(<DesktopLibrary />);
    transport().openPreview('/api/files/a1');

    expect(mocks.openExternalUrl).toHaveBeenCalledWith('https://agiworkforce.com/api/files/a1');
  });
});
