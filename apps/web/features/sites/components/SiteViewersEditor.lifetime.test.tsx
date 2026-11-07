import { StrictMode, type FormEvent, type MouseEvent } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { SiteViewersEditor } from './SiteViewersEditor';
import { beginPublicationCleanup } from '../stores/published-sites-store';

vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn() }));
const fetchMock = vi.fn<typeof fetch>();
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const response = (email = 'ana@example.com') => Response.json({
  viewers: email ? [{ email, invitedAt: 'now' }] : [],
});
const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method);
const ready = () => waitFor(() => expect(screen.getByLabelText('Email address to share with')).toBeEnabled());
function callbacks() {
  const props = (element: Element) => {
    const key = Object.keys(element).find((name) => name.startsWith('__reactProps$'));
    if (!key) throw new Error('Rendered React handler props unavailable');
    return (element as unknown as Record<string, {
      onSubmit?: (event: FormEvent) => void;
      onClick?: (event: MouseEvent) => void;
    }>)[key]!;
  };
  const input = screen.getByLabelText('Email address to share with');
  const submit = props(input.closest('form')!).onSubmit!;
  const remove = screen.queryByRole('button', { name: 'Stop sharing with ana@example.com' });
  const retry = screen.queryByRole('button', { name: 'Retry' });
  const removeHandler = remove ? props(remove).onClick : undefined;
  const retryHandler = retry ? props(retry).onClick : undefined;
  return {
    add: () => submit({ preventDefault: vi.fn() } as unknown as FormEvent),
    remove: () => removeHandler?.({} as MouseEvent),
    retry: () => retryHandler?.({} as MouseEvent),
  };
}
function enterEmail() {
  fireEvent.change(screen.getByLabelText('Email address to share with'), {
    target: { value: 'new@example.com' },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  beginPublicationCleanup()();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async () => response());
  vi.mocked(addCsrfHeaders).mockResolvedValue({ 'X-CSRF-Token': 'csrf' });
});
afterEach(() => { cleanup(); beginPublicationCleanup()(); vi.unstubAllGlobals(); });

describe('Viewer dispatch lifetime (UNRUN source fixtures)', () => {
  it.each(['add', 'remove'] as const)('blocks deferred %s preparation across every retirement', async (action) => {
    for (const retirement of ['token', 'unmount', 'lease'] as const) {
      const csrf = deferred<Record<string, string>>();
      vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
      const mounted = render(<SiteViewersEditor token="first" />);
      await ready();
      enterEmail();
      const retained = callbacks();
      const before = writes().length;
      act(() => { retained[action](); retained[action](); });
      expect(screen.getByRole('status')).toHaveTextContent('Updating access');
      if (retirement === 'unmount') mounted.unmount();
      else if (retirement === 'token') {
        mounted.rerender(<SiteViewersEditor token="second" />);
        mounted.rerender(<SiteViewersEditor token="first" />);
      } else act(() => beginPublicationCleanup()());
      if (retirement !== 'unmount') await ready();
      await act(async () => { csrf.resolve({ 'X-CSRF-Token': 'csrf' }); });
      act(() => { retained.add(); retained.remove(); });
      expect(writes()).toHaveLength(before);
      if (retirement !== 'unmount') {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        enterEmail();
        act(() => callbacks()[action]());
        await ready();
        expect(writes()).toHaveLength(before + 1);
      }
      mounted.unmount();
    }
  });

  it.each(['add', 'remove'] as const)('rejects %s dispatch on synchronous lease retirement before React cleanup', async (action) => {
    const mounted = render(<SiteViewersEditor token="first" />);
    await ready();
    enterEmail();
    const retained = callbacks();
    vi.mocked(addCsrfHeaders).mockImplementationOnce(async () => {
      beginPublicationCleanup()();
      return { 'X-CSRF-Token': 'csrf' };
    });
    await act(async () => { retained[action](); });
    expect(writes()).toHaveLength(0);
    await ready();
    act(() => { retained.add(); retained.remove(); });
    expect(writes()).toHaveLength(0);
    mounted.unmount();
  });

  it('rejects retained controls immediately when the lease retires within the same act', async () => {
    render(<SiteViewersEditor token="first" />);
    await ready();
    enterEmail();
    const retained = callbacks();
    act(() => {
      const resume = beginPublicationCleanup();
      retained.add();
      retained.remove();
      resume();
      retained.add();
      retained.remove();
      expect(addCsrfHeaders).not.toHaveBeenCalled();
    });
    await ready();
    expect(writes()).toHaveLength(0);
  });

  it.each(['add', 'remove'] as const)('suppresses retired %s decode and errors', async (action) => {
    for (const outcome of ['decode', 'http-error', 'transport-error', 'csrf-error'] as const) {
      const pending = deferred<Response>();
      const body = deferred<unknown>();
      const entered = deferred<void>();
      const csrf = deferred<Record<string, string>>();
      const mounted = render(<SiteViewersEditor token="first" />);
      await ready();
      enterEmail();
      if (outcome === 'csrf-error') vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
      else if (outcome === 'transport-error') fetchMock.mockReturnValueOnce(pending.promise);
      else {
        const decoding = Response.json({}, { status: outcome === 'http-error' ? 403 : 200 });
        vi.spyOn(decoding, 'json').mockImplementation(() => { entered.resolve(); return body.promise; });
        fetchMock.mockResolvedValueOnce(decoding);
      }
      act(() => callbacks()[action]());
      if (outcome === 'decode' || outcome === 'http-error') await act(async () => entered.promise);
      else await act(async () => {});
      mounted.rerender(<SiteViewersEditor token="second" />);
      await ready();
      enterEmail();
      const count = fetchMock.mock.calls.length;
      await act(async () => {
        if (outcome === 'transport-error') pending.reject(new Error('late transport error'));
        else if (outcome === 'csrf-error') csrf.reject(new Error('late CSRF error'));
        else body.resolve(outcome === 'decode' ? { viewers: [] } : { error: 'late forbidden' });
      });
      expect(screen.getByText('ana@example.com')).toBeInTheDocument();
      expect(screen.getByLabelText('Email address to share with')).toHaveValue('new@example.com');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(count);
      mounted.unmount();
    }
  });

  it('binds retained add/remove/retry callbacks to their accepted result across operation ABA', async () => {
    render(<SiteViewersEditor token="first" />);
    await ready();
    enterEmail();
    const first = callbacks();
    const csrf = deferred<Record<string, string>>();
    vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
    act(() => { first.add(); first.add(); first.remove(); });
    expect(addCsrfHeaders).toHaveBeenCalledTimes(1);
    await act(async () => { csrf.resolve({ 'X-CSRF-Token': 'csrf' }); });
    await ready();
    act(() => { first.add(); first.remove(); });
    expect(writes()).toHaveLength(1);
    expect(writes()[0]![1]).toMatchObject({ credentials: 'include', method: 'POST' });
    expect(new Headers(writes()[0]![1]?.headers).has('Authorization')).toBe(false);
    const failure = deferred<Response>();
    fetchMock.mockReturnValueOnce(failure.promise);
    const second = callbacks();
    act(() => second.remove());
    await waitFor(() => expect(writes()).toHaveLength(2));
    await act(async () => { failure.reject(new Error('outcome unknown')); });
    expect(screen.getByRole('alert')).toHaveTextContent('Access may have changed');
    act(() => { first.add(); second.remove(); });
    expect(writes()).toHaveLength(2);
    const failed = callbacks();
    const reload = deferred<Response>();
    fetchMock.mockReturnValueOnce(reload.promise);
    const count = fetchMock.mock.calls.length;
    act(() => { failed.retry(); failed.retry(); });
    expect(fetchMock).toHaveBeenCalledTimes(count + 1);
    await act(async () => { reload.resolve(response()); });
    await ready();
    act(() => { failed.retry(); first.add(); second.remove(); });
    expect(fetchMock).toHaveBeenCalledTimes(count + 1);
    act(() => callbacks().remove());
    await ready();
    expect(writes()).toHaveLength(3);
  });

  it('uses a fresh StrictMode activation and rejects the old response', async () => {
    const body = deferred<unknown>();
    const old = Response.json({});
    vi.spyOn(old, 'json').mockReturnValue(body.promise);
    fetchMock.mockResolvedValueOnce(old);
    render(<StrictMode><SiteViewersEditor token="first" /></StrictMode>);
    await ready();
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    enterEmail();
    act(() => callbacks().add());
    await ready();
    await act(async () => { body.resolve({ viewers: [] }); });
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
  });
});
