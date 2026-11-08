import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  observePreferenceOwner,
  type PreferenceOwner,
} from '@/app/settings/_lib/preferences-client';
import { DeviceSignInToggle } from '../DeviceSignInToggle';

const identity = vi.hoisted(() => ({ owner: null as PreferenceOwner | null }));
vi.mock('../../hooks/use-preference-owner', async (original) => ({
  ...(await original<ImportedModule0>()),
  usePreferenceOwner: () => identity.owner,
}));
vi.mock('@/lib/client/csrf', async (original) => ({
  ...(await original<ImportedModule1>()),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => new Headers(headers)),
}));
const fetchMock = vi.fn<typeof fetch>();
const SWITCH_NAME = 'Approve sign-in from a device code';
const toggle = () => screen.getByRole('switch', { name: SWITCH_NAME });
const response = (enabled: boolean, receipt = false) =>
  Response.json({
    settings: receipt
      ? { security: { deviceCodeSignInEnabled: enabled } }
      : { deviceCodeSignInEnabled: enabled },
    version: 'v1',
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
let live: boolean;
const listeners = new Set<() => void>();
function setOwner(id: string) {
  identity.owner = observePreferenceOwner({
    userId: id,
    sessionId: id,
    isCurrent: () => live,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getToken: async () => `token-${id}`,
  });
}
beforeEach(() => {
  listeners.clear();
  live = false;
  observePreferenceOwner(null);
  live = true;
  setOwner('a');
  fetchMock.mockReset().mockResolvedValue(response(false));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  live = false;
  observePreferenceOwner(null);
  vi.unstubAllGlobals();
});

describe('device sign-in switch ownership', () => {
  it('keeps the shared off-state edge and confirms a patch before changing display', async () => {
    const write = deferred<Response>();
    fetchMock.mockResolvedValueOnce(response(false)).mockReturnValueOnce(write.promise);
    render(<DeviceSignInToggle />);
    await waitFor(() => expect(toggle()).toBeEnabled());
    expect(toggle()).toHaveAttribute('data-state', 'unchecked');
    expect(toggle().className).toContain(
      'data-[state=unchecked]:border-[color:var(--switch-off-edge)]',
    );
    fireEvent.click(toggle());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(toggle()).toHaveAttribute('data-state', 'unchecked');
    expect(toggle()).toBeDisabled();
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      namespace: 'security',
      patch: { deviceCodeSignInEnabled: true },
    });
    await act(async () => write.resolve(response(true, true)));
    await waitFor(() => expect(toggle()).toBeEnabled());
    expect(toggle()).toHaveAttribute('data-state', 'checked');
  });
  it('admits only one same-turn write', async () => {
    const write = deferred<Response>();
    fetchMock.mockResolvedValueOnce(response(false)).mockReturnValueOnce(write.promise);
    render(<DeviceSignInToggle />);
    await waitFor(() => expect(toggle()).toBeEnabled());
    act(() => {
      fireEvent.click(toggle());
      fireEvent.click(toggle());
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => write.resolve(response(true, true)));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('keeps failed reads unknown and offers retry', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response(true));
    render(<DeviceSignInToggle />);
    await screen.findByText('Your device sign-in setting is unknown. Retry loading it.');
    expect(toggle()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh setting' }));
    await waitFor(() => expect(toggle()).toBeEnabled());
    expect(toggle()).toHaveAttribute('data-state', 'checked');
  });
  it('blocks unknown writes across refresh until deliberate acknowledgement', async () => {
    fetchMock
      .mockResolvedValueOnce(response(false))
      .mockRejectedValueOnce(new Error('lost receipt'))
      .mockResolvedValueOnce(response(true));
    render(<DeviceSignInToggle />);
    await waitFor(() => expect(toggle()).toBeEnabled());
    fireEvent.click(toggle());
    await screen.findByText(/We could not confirm whether your change was saved/);
    expect(toggle()).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'I understand; allow another change' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh setting' }));
    const acknowledge = await screen.findByRole('button', {
      name: 'I understand; allow another change',
    });
    expect(toggle()).toHaveAttribute('data-state', 'checked');
    expect(toggle()).toBeDisabled();
    fireEvent.click(acknowledge);
    expect(toggle()).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('rejects stale read completion after active ABA', async () => {
    const oldRead = deferred<Response>();
    fetchMock.mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce(response(false));
    const view = render(<DeviceSignInToggle />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    view.rerender(<DeviceSignInToggle active={false} />);
    view.rerender(<DeviceSignInToggle active />);
    await waitFor(() => expect(toggle()).toBeEnabled());
    await act(async () => oldRead.resolve(response(true)));
    expect(toggle()).toHaveAttribute('data-state', 'unchecked');
  });
  it('retires StrictMode generations and unmounted body continuations', async () => {
    const body = deferred<unknown>();
    const parsing = deferred<void>();
    const pending = new Response();
    vi.spyOn(pending, 'json').mockImplementation(() => {
      parsing.resolve();
      return body.promise;
    });
    fetchMock.mockResolvedValue(pending);
    const view = render(
      <StrictMode>
        <DeviceSignInToggle />
      </StrictMode>,
    );
    await parsing.promise;
    view.unmount();
    await act(async () =>
      body.resolve({ settings: { deviceCodeSignInEnabled: true }, version: 'v1' }),
    );
    expect(screen.queryByRole('switch', { name: SWITCH_NAME })).not.toBeInTheDocument();
  });
  it('retains uncertainty when closed after dispatch and ignores old receipt', async () => {
    const write = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(response(false))
      .mockReturnValueOnce(write.promise)
      .mockResolvedValueOnce(response(false));
    const view = render(<DeviceSignInToggle />);
    await waitFor(() => expect(toggle()).toBeEnabled());
    fireEvent.click(toggle());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    view.rerender(<DeviceSignInToggle active={false} />);
    view.rerender(<DeviceSignInToggle active />);
    await screen.findByRole('button', { name: 'I understand; allow another change' });
    await act(async () => write.resolve(response(true, true)));
    expect(toggle()).toHaveAttribute('data-state', 'unchecked');
    expect(toggle()).toBeDisabled();
  });
  it('withdraws visible ready state on a native owner-loss notification', async () => {
    fetchMock.mockResolvedValueOnce(response(true));
    render(<DeviceSignInToggle />);
    await waitFor(() => expect(toggle()).toBeEnabled());
    expect(toggle()).toHaveAttribute('data-state', 'checked');
    act(() => {
      live = false;
      for (const listener of [...listeners]) listener();
    });
    expect(toggle()).toBeDisabled();
    expect(toggle()).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByText('Your device sign-in setting is unknown.')).toBeInTheDocument();
  });
  it('recaptures a replacement owner after a pending read silently loses ownership', async () => {
    const oldRead = deferred<Response>();
    fetchMock.mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce(response(true));
    render(<DeviceSignInToggle />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    live = false;
    observePreferenceOwner(null);
    live = true;
    setOwner('replacement');
    await act(async () => oldRead.resolve(response(false)));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(toggle()).toBeEnabled());
    expect(toggle()).toHaveAttribute('data-state', 'checked');
    const headers = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-replacement');
  });
  it('masks old-owner results and does not admit a silent owner loss', async () => {
    const oldRead = deferred<Response>();
    fetchMock.mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce(response(false));
    const view = render(<DeviceSignInToggle />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    live = false;
    observePreferenceOwner(null);
    live = true;
    setOwner('b');
    view.rerender(<DeviceSignInToggle />);
    await waitFor(() => expect(toggle()).toBeEnabled());
    await act(async () => oldRead.resolve(response(true)));
    expect(toggle()).toHaveAttribute('data-state', 'unchecked');
    live = false;
    fireEvent.click(toggle());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

type ImportedModule0 = typeof import('../../hooks/use-preference-owner');
type ImportedModule1 = typeof import('@/lib/client/csrf');
